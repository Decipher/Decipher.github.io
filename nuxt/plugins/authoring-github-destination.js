/**
 * Where this site's session record is published, told to the editing module.
 *
 * The module reads a record from its own URL and knows no host by name. This
 * site's record sits behind a CDN that can answer with a file five minutes
 * old, and a signed-in author has a better address available, so the module is
 * told about it here.
 *
 * The shaping itself is in `lib/github.mjs` with the rest of this site's
 * GitHub knowledge. Only `recordRequest` is given: the token comes from the
 * default destination, which reads the `sessionRecord.tokenKey` this site
 * already sets.
 */
import { defineDestination } from '@druxt-contrib/inline-content-edit'

import { sessionRecordRequest } from '../lib/github.mjs'

export default defineDestination({
  id: 'github',
  recordRequest: (recordUrl, { token }) => sessionRecordRequest(recordUrl, token),
})
