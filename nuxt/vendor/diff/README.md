# Vendored: @druxt-contrib/diff

Built from `druxt/druxt-diff`, branch `feature/nuxt2-package-format`, commit
`9af8a809a5cc`.

Vendored rather than installed because the package is not published yet, on the
same terms as the two modules beside it.

Declared as `file:vendor/diff` so the package name resolves in
`node_modules`, which the plugin template needs: it imports the package by
name rather than by a relative path that would climb out of `dist`.
