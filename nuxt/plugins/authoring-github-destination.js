/**
 * Where this site's session record is published, told to the editing module.
 *
 * The module reads a record from its own URL. That URL is served through a CDN
 * with `max-age=300`, and `cache: 'no-store'` speaks to the browser's cache and
 * not to that one, so a backend that came up a minute ago can stay invisible
 * for five, and a 404 fetched before the session started is cached as happily
 * as a hit.
 *
 * A signed-in author has a better address available. The contents API is not
 * the CDN and is current the moment the job pushes the branch, which is as
 * close to the job telling the page as a static site gets.
 *
 * Only `recordRequest` is given. The token comes from the default destination,
 * which reads the `sessionRecord.tokenKey` this site already sets.
 */
import { defineDestination } from '@druxt-contrib/inline-content-edit'

import { contentsApiUrl } from '~/lib/github.mjs'

export default defineDestination({
  id: 'github',

  recordRequest(recordUrl, { token }) {
    const api = token && contentsApiUrl(recordUrl)
    // Nothing usable means the module falls back to the plain URL, which is
    // what an anonymous visitor gets and what a record published anywhere
    // else gets.
    if (!api) return null
    return {
      url: api,
      headers: {
        // The file itself rather than the metadata envelope, so the module
        // parses one shape whichever address answered.
        accept: 'application/vnd.github.raw',
        authorization: `Bearer ${token}`,
      },
    }
  },
})
