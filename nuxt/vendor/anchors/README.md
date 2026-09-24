# Vendored: @druxt-contrib/anchors

Built from `druxt/druxt-anchors`, branch `fix/descendant-anchors-and-delta`,
commit `f599a00`.

Vendored rather than installed because the package is not published yet, on the
same terms as the modules beside it. This is the shared DOM anchor contract:
the four `data-druxt-*` attributes and the helpers that write and read them.
The site emits them from its entity and field wrappers and reads them back in
the authoring drawer, so a diff overlay or an editor from another module can
find the same element the site rendered.

Declared as `file:vendor/anchors` so the package name resolves in
`node_modules`.

The package's own `package.json` declares `"type": "module"`, which makes Node
treat `dist/index.ssr.js` as an ES module even though siroc writes it as
CommonJS. `nuxt generate` renders on the server and `require()`s this package,
so that declaration is left out here, as it is for every module beside it.
