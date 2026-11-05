/**
 * What the page's own chrome is showing, for the parts of it that live apart.
 *
 * One fact so far: whether the site header is on the page. The header lives
 * inside DruxtSite, which renders nothing at all while a connected backend
 * fails to answer, and the layout needs to know that to keep a way to sign in
 * on screen. A flag rather than a DOM query, so the layout reacts to it.
 */
export const state = () => ({
  header: false,
})

export const mutations = {
  setHeader(state, present) {
    state.header = Boolean(present)
  },
}
