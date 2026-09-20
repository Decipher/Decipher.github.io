# Vendored: @druxt-contrib/inline-content-edit

Built from `druxt/druxt-inline-content-edit`, branch `feature/2-components`,
commit `790ad8939d41`.

Vendored rather than installed because the package is not published yet. A
dependency on the branch it lives on would be a private host in a public
repository: the build would fail for anybody outside this network, and
`lint:private` refuses it for that reason.

This one is declared in `package.json` as `file:vendor/inline-content-edit`
rather than listed in `modules` by path, which the vendored decoupled-settings
does. The reason is the components. They are built to `dist/components` and
import the package by its own name, so the name has to resolve in
`node_modules`. A `file:` dependency inside the repository gives exactly that,
resolves for anybody who clones, and names no private host.

Only the built output is here: `dist`, `templates` and a trimmed
`package.json`. The manifest keeps the fields that make the package
resolvable and drops the rest, because the scripts it used to carry point at
files that were never copied, and npm runs `postinstall` for a `file:`
dependency.

Replace this directory with a normal dependency once the package is on npm:

```sh
npm install @druxt-contrib/inline-content-edit
```

The `modules` entry in `nuxt.config.js` already uses the package name, so
nothing there changes.

Do not edit anything here. Fixes belong upstream, in the module's own
repository, and arrive back through a rebuild.
