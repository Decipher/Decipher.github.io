/**
 * The `$druxtIce` plugin, rendered by Nuxt with the module's options.
 *
 * The store module is registered on both sides, so a page rendered on the
 * server or at generate time carries the cart's shape in its payload and the
 * client finds it there and keeps it. The connection is client-only: it
 * reads storage and the URL, and there is no browser on the server.
 */
import { installIce, registerIceStore } from '@druxt-contrib/inline-content-edit'

const options = <%= JSON.stringify(options) %>

export default async (context, inject) => {
  registerIceStore(context.store)
  if (!process.client) return undefined
  return installIce(options, context, inject)
}
