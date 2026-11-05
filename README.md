# Deciphered

The source of [decipher.github.io](https://decipher.github.io): a Drupal site
with no Drupal running behind it.

Drupal is the content model, the editorial workflow and the store, and it only
runs while the site builds. [Tome](https://www.drupal.org/project/tome) keeps
the content and configuration in this repository as files, a build stands
Drupal up from them, and [Druxt](https://druxtjs.org) renders every page with
Nuxt 2 into static files that GitHub Pages serves. What a reader gets has no
backend at all.

The site can still be edited in place, with no backend running. See
[Editing the site](#editing-the-site).

## How it is laid out

| Path              | What is in it                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `drupal/`         | A Composer project on `drupal/recommended-project` lines, with `web/` as the docroot        |
| `drupal/config/`  | The configuration, exported. `config_sync_directory` points here                            |
| `drupal/content/` | The content, as Tome writes it                                                              |
| `drupal/files/`   | Uploaded files, as Tome writes them                                                         |
| `nuxt/`           | The Nuxt 2 application. `npm run generate` writes the site to `nuxt/dist/`                  |
| `nuxt/vendor/`    | Built copies of Druxt modules that are not on npm yet. `npm run vendor:sync` refreshes them |
| `scripts/`        | The npm scripts that run both halves together                                               |
| `docs/`           | How editing without a backend works                                                         |

Both halves follow their own ecosystem's conventions, because Druxt is the
bridge between them rather than a third way of doing either.

## Getting started

Requires [Node 16](.nvmrc) and one of:

- PHP 8.3 or newer (with the pdo_sqlite extension) + Composer on your
  machine
  (Drush comes with the backend - no global install needed), or
- [DDEV](https://ddev.readthedocs.io) or [Lando](https://lando.dev) (Docker)

On Windows, use the dev container, WSL2, or a container backend - see
[Windows](#windows).

[nvm](https://github.com/nvm-sh/nvm) or [mise](https://mise.jdx.dev/) users:
`nvm use` / `mise install` provides the pinned versions.

### One-command setup (local PHP + SQLite, no Docker)

1. From the repository root:

   ```bash
   npm run setup
   ```

   This installs the frontend dependencies, provisions Drupal from the
   committed config and Tome content (SQLite, throwaway), starts the
   backend, and writes `BASE_URL` to `.env`.

   `make setup` works too, as do `make dev`, `make generate`, `make
info`, `make reset`, etc.

2. Develop against the live backend:

   ```bash
   npm run dev
   ```

   - Drupal backend: http://127.0.0.1:8888
   - Nuxt frontend: http://localhost:3000 (or the next free port up to
     3009, which it prints)
   - One-time Drupal login: `npm run login`

3. Build the full static site:

   ```bash
   npm run generate
   ```

   Ensures the backend is up, then writes the deployable output to
   `nuxt/dist/`.

`npm run dev`, `npm run start` and `npm run generate` all automatically
start the local backend if it is not already running, and leave
external backends alone.

Other commands: `npm run stop`, `npm run reset` (fresh site), `npm run
info`, `npm run login`, `npm run devtools -- <script>` for direct access
to `drupal/.devtools/`. See `drupal/.devtools/README.md` for what each
backend script does.

### Local development with [DDEV](https://ddev.readthedocs.io)

Using DDEV? Keep `BASE_URL` as the `*.ddev.site` URL in `.env`
(`cp .env.example .env` gives you that). Then:

1. Frontend (from repository root):

   ```bash
   npm run setup
   ```

   Detecting the DDEV `BASE_URL`, this installs the frontend only and
   prints the backend steps.

2. Backend (from `drupal/`):

   ```bash
   ddev start
   ddev drupal-install
   ```

3. `npm run dev` / `npm run generate` as above. The DDEV backend is
   never auto-started or auto-stopped from the npm scripts.

### Local development with [Lando](https://lando.dev)

Set `BASE_URL` in `.env` to your Lando URL
(`https://deciphered.lndo.site` for the bundled `drupal/.lando.yml`).
Then:

1. Frontend (from repository root):

   ```bash
   npm run setup
   ```

   Any non-loopback `BASE_URL` is treated as a backend this repo does not
   manage, so this installs the frontend only.

2. Backend (from `drupal/`):

   ```bash
   lando start
   lando drupal-install
   ```

   This runs the same install steps as the DDEV command.

3. `npm run dev` as above. `npm run drush -- <command>` is proxied
   through `lando drush`.

### Troubleshooting

#### Port 3000 is already in use

`npm run dev` takes the next free port between 3000 and 3009 and says
which one it picked, so the frontend address stays knowable.

Naming a port yourself turns that off: `PORT=3005 npm run dev` uses 3005
or fails, because a port you asked for is a decision rather than a
default. If the whole range is busy, `npm run dev` says so instead of
letting Nuxt fall back to a random port.

### Windows

The local PHP backend does not run on Windows directly: it manages a PHP
built-in server with `nohup`, `lsof`, `ps` and `kill`. `npm run setup`
says so rather than failing part-way through.

Any of these work instead, with no changes to the repository:

- the dev container,
- WSL2, running the same commands inside your Linux distribution,
- DDEV or Lando, setting `BASE_URL` to the container URL.

### Development Container (VS Code, Codespaces, DevPod)

`.devcontainer/devcontainer.json` gives you a ready environment: Node
16, PHP 8.4, Composer, and `mise` (config pre-trusted), provisioned
through `drupal/.devtools` (PHP built-in server + SQLite) - no
Docker-in-Docker needed.

| Tool                        | How                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| VS Code                     | Clone, open the folder, run **Dev Containers: Reopen in Container**                                                           |
| GitHub Codespaces           | On the repository page: **Code**, then **Open with Codespaces**                                                               |
| [DevPod](https://devpod.sh) | `devpod up https://github.com/Decipher/Decipher.github.io`, or add the same URL as a workspace source in DevPod's desktop app |

First open runs `npm install` at the repository root, which triggers
the same full setup as `npm run setup`: frontend dependencies, Composer,
Drupal installed straight from the committed Tome config and content, and
the backend started and ready. Then:

```bash
npm run dev
```

- Drupal backend: http://127.0.0.1:8888
- Nuxt frontend: http://localhost:3000 (or the next free port up to
  3009, which it prints)

In a Development Container, forwarded ports are accessible via your
editor's **Ports** panel, or Codespaces' own URL pattern for forwarded
ports.

## Editing the site

The site can be edited in place by anyone who may push to the repository, with
no backend running: changes are held in the browser and leave either to a live
Drupal or to the repository as a pull request.

See [docs/authoring.md](docs/authoring.md).

## Drupal's administration

`/admin` and the rest of Drupal's own paths belong to the backend. By default
the site links out to them, and the generated site has no admin routes, so on
GitHub Pages none of this renders.

With a server running, the site can serve Drupal's administration from its own
origin instead:

```bash
DRUXT_ADMIN_MODE=proxy npm run dev
```

Then `http://localhost:3000/user/login` is Drupal's login form, and the session
it starts is first party. It runs under `npm run dev` only: this site builds
with `target: 'static'`, and neither the generated files nor `nuxt start` on
them run server middleware.

## Vendored modules

`nuxt/vendor/` holds Druxt modules that are not on npm yet, built from their own
repositories. Refresh one from a local clone of its repository:

```bash
npm run vendor:sync -- <name> <path to its checkout> [ref]
npm --prefix nuxt install
```

The build runs in a throwaway worktree of that exact commit, so uncommitted work
in the checkout never reaches the site, and the README it writes records the
commit. Run it under the Node version the module pins.

A vendored package is a build, and a Nuxt application's `.gitignore` ignores
`dist`. This one un-ignores `vendor/*/dist/`, which is what lets the build be
committed at all. Without those two lines a vendored package is committed with
its build missing, and nothing says so until a deployment whose install may not
reach outside the lock file fails.

## Services

| Port   | Service                                                                               |
| ------ | ------------------------------------------------------------------------------------- |
| `3000` | Nuxt                                                                                  |
| `3003` | Storybook                                                                             |
| `8888` | Drupal (local `.devtools` backend - DDEV serves at its own `*.ddev.site` URL instead) |

## Tools

### DDEV

DDEV manages the Drupal instance and provides a CLI for common Drupal tasks,
including `ddev drush`. Run its commands from the `drupal/` directory.

Documentation: https://ddev.readthedocs.io

### Lando

- [lando.dev](https://lando.dev)
- Config: [drupal/.lando.yml](drupal/.lando.yml)

### @nuxtjs/storybook

Druxt integrates with the Nuxt Storybook module to provide zero-configuration,
auto-discovered stories with access to live data from your Drupal backend.

To start Storybook, run `npx nuxt storybook` from the `nuxt/` directory.

### Tome sync

Tome keeps content and configuration as files in the repository, so the site
doesn't need a database outside a build.

Project page: https://www.drupal.org/project/tome

## Where it came from

The site started from the Druxt serverless starter kit,
[druxt/quickstart-druxt-serverless](https://github.com/druxt/quickstart-druxt-serverless),
and has grown its own editing and deployment since.

## Licence

[MIT](LICENSE)
