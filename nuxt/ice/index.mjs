/**
 * Inline Content Edit: the parts of in-browser authoring that are not this site.
 *
 * Everything exported here works against Druxt's client and a JSON:API backend
 * and knows nothing about how this particular site looks, where it sends its
 * changes, or whether it has a backend at all. That is the whole point of the
 * boundary: what is in here should survive being lifted into a contrib module,
 * and what is outside it should not have to move.
 *
 * See README.md for what is deliberately not in here.
 */

export * from './src/authoring.mjs'
export * from './src/captions.mjs'
export * from './src/cart.mjs'
export * from './src/ckeditor.mjs'
export * from './src/ckeditor-upload.mjs'
export * from './src/datetime.mjs'
export * from './src/diff.mjs'
export * from './src/editor.mjs'
export * from './src/files.mjs'
export * from './src/form-groups.mjs'
export * from './src/formats.mjs'
export * from './src/preview.mjs'
export * from './src/reference.mjs'
export * from './src/upload.mjs'
export * from './src/view-modes.mjs'
