# Inline Content Edit

Editing a Druxt site from the page it renders: stage changes in the browser,
look at them, send them somewhere.

This directory is a module that has not been extracted yet. It lives inside the
site so it stays honest, because a boundary nothing runs against is a boundary
that drifts. The intent is that it becomes a Druxt contrib module, and the test
of every change here is whether it would still make sense in a repository that
knows nothing about this site.

## What is in here

The parts that are true of any Druxt site talking to a JSON:API backend.

| Module | What it decides |
| --- | --- |
| `cart` | What a staged change is, what order changes commit in, what a request body looks like |
| `authoring` | Whether a backend is usable, which source of one wins, whether a session has expired |
| `upload` | Putting bytes into Drupal over JSON:API, and the alt text a field requires |
| `files` | The three addresses one Drupal file has, and translating between them |
| `captions` | Where a caption lives, which depends on whether the format runs `filter_caption` |
| `editor` | The toolbar a text format is configured for, in CKEditor's vocabulary rather than Drupal's |
| `ckeditor` | Assembling CKEditor from DLL builds, so the configured toolbar is the toolbar |
| `ckeditor-upload` | Getting an image into a body as Drupal records one |
| `view-modes` | The display modes a bundle has |
| `reference` | How a reference field names the thing it points at |
| `datetime`, `form-groups` | Field widget decisions |
| `preview` | Showing content that exists only in the cart |
| `diff` | Showing what changed in a value too long to show whole |

Every one of these is a pure function or close to it, and every one has tests
that run without a browser or a backend.

## What is deliberately not in here

**This site's appearance.** `regions`, `sticky`, `prose`, `teaser` and
`settings` are decisions about how Deciphered looks. A module that shipped them
would be a theme.

**Where changes go.** `github` and `github-client` open a pull request, which is
one destination out of several worth having: a GitLab equivalent, a Kubernetes
job, or writing straight to Drupal. The module should define what a destination
has to do and let a site choose; it should not have GitHub in it.

**The components.** The Vue components that render an edit panel, a drawer and a
toolbar are still in `nuxt/components`. They are the least portable part,
because they carry Tailwind classes and this site's layout decisions, and the
module has to be usable by a site that renders its own.

## Things a site should be able to decide

Recorded here because they are the reason for the boundary rather than
consequences of it, and because none of them are implemented as options yet.

- **Whether editing needs authentication at all.** Staging works with no
  backend and no account. Committing does not. A site may want to require a
  sign-in before the first keystroke, and a site may not.
- **Whether the page updates as you type.** Live rendering of staged values is
  the flashy part and it is not free; a site should be able to turn it off.
- **Where changes go**, per the destination note above.
- **Which resources the editor needs.** Reading a text format's toolbar needs
  `editor--editor` exposed, which is a Drupal-side decision a site makes.

## Working on it

Imports are `../ice/src/<module>.mjs` from a component, or the package root
from outside. Nothing in `src/` may import from `nuxt/lib`, `nuxt/components`
or the store: if it needs to, it belongs on the other side of the line.
