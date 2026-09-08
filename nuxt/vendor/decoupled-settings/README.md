# Vendored: @druxt-contrib/decoupled-settings

Built from `druxt/druxt-decoupled-settings`, branch
`feature/1-decoupled-settings-module`, commit `b42e1f1f18e7`.

Vendored rather than installed because the package is not published yet. A
dependency on the branch it lives on would be a private host in a public
repository: the build would fail for anybody outside this network, and
`lint:private` refuses it for that reason.

Replace this directory with a normal dependency once the package is on npm:

```sh
npm install @druxt-contrib/decoupled-settings
```

and change `modules` in `nuxt.config.js` back to the package name.

Do not edit anything here. Fixes belong upstream, in the module's own
repository, and arrive back through a rebuild.
