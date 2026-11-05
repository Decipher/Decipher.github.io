# Vendored: @druxt-contrib/ckeditor

Built from `druxt/druxt-ckeditor`, branch `feature/1-ckeditor-module`, commit
`dcd7a6545c67`.

Vendored rather than installed because the package is not published yet. A
dependency on the branch it lives on would be a private host in a public
repository: the build would fail for anybody outside this network, and
`lint:private` refuses it for that reason.

Declared in `package.json` as `file:vendor/ckeditor`, for the same reason as
the vendored inline-content-edit beside it: the built component imports the
package by its own name, so the name has to resolve in `node_modules`.

`nuxt.config.js` also imports `DEFAULT_PACKAGES` from here to build the editor
asset list, which is a second reason the package name has to resolve rather
than being a path in `modules`.

Only the built output is here: `dist`, `templates` and a trimmed
`package.json`.

Replace this directory with a normal dependency once the package is on npm:

```sh
npm install @druxt-contrib/ckeditor
```

Do not edit anything here. Fixes belong upstream, in the module's own
repository, and arrive back through a rebuild.
