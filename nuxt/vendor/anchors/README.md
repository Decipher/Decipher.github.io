# Vendored: @druxt-contrib/anchors

Built from `druxt/druxt-anchors`, branch `fix/descendant-anchors-and-delta`,
commit `7f0c0fc`.

Vendored rather than installed because the package is not published yet, on the
same terms as the modules beside it. This is the shared DOM anchor contract:
the four `data-druxt-*` attributes and the helpers that write and read them.
The site emits them from its entity and field wrappers and reads them back in
the authoring drawer, so a diff overlay or an editor from another module can
find the same element the site rendered.

The manifest is the package's own, `"type": "module"` included. Its CommonJS
build is named `dist/index.ssr.cjs`, so `nuxt generate`, which renders on the
server and `require()`s this package as an external, gets a file Node will
read as CommonJS whatever the package declares.

Declared as `file:vendor/anchors` so the package name resolves in
`node_modules`.
