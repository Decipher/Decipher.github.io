# Editing the site

A static site with no backend, that anyone who may push to the repository can
edit in place.

Turn on **Edit** and every entity on the page gains a control. What you change
is held in a cart in the browser and sent when you choose, either to a Drupal
that is running or to the repository as a pull request. Nothing is written as
you type, and nothing needs a server to be running while you write.

## The two ways a change leaves

**To a backend.** Sign in to a Drupal and the cart commits to it over JSON:API,
one request per resource in dependency order. This is the short loop: it needs a
backend, and it validates against the site's real field definitions.

**To the repository.** Sign in with GitHub and the cart becomes a pull request:
the staged resources, the bytes of any picture, and an explicit list of
deletions, committed to a branch. A job on that pull request stands a Drupal up,
applies the document and commits back the content Tome writes, so review sees
the real content diff rather than a document describing one.

The second path needs no backend at any point a person is waiting. See
[`scripts/apply-change-request.sh`](../scripts/apply-change-request.sh) and
[`.github/workflows/content.yml`](../.github/workflows/content.yml).

## The cart

Two layers, because they answer different questions.

|              |                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------- |
| **Staged**   | changes you have committed to sending. Persisted to `localStorage`, so they survive a reload |
| **Unstaged** | what you have typed and not yet stood behind. In memory only                                 |

Both render. The page shows the site as it will read once the change is merged,
because a badge saying something changed with nothing on the page changed is
hard to trust.

A change carries only the fields that actually differ. Sending a whole entity
back would overwrite fields you never looked at with whatever the form happened
to hold.

New content gets an id in the browser, so a reference can point at something
that does not exist yet. Drupal keeps the id it is given, which is what makes
that reference resolve when the request finally goes out.

## How it fits together

```text
   a field widget          the cart                 the page
   ──────────────          ────────                 ────────
   field/Default.vue  ──▶  store/authoringCart  ──▶  entity/Node.vue
        │                      ▲                          │
        │ onFieldInput()       │ stage / stageNew         │ merged =
        ▼                      │                          │ entity + staged + unstaged
   AuthoringEntityForm  ───────┘                          ▼
                                                     what you see
```

The form and the rendering of what it edits are two components with no
relationship to each other. The cart is the only thing joining them, and it is
what makes a title appear as it is typed:

- a widget writes to its own `model`, which is reactive data
- the field tells the form (`onFieldInput`), because Druxt builds each field's
  slot itself and a field is not a child of anything that would hear an event
- the form writes the delta to the cart, with no debounce
- `Node.vue` recomputes `merged`, a computed over the fetched entity plus the
  staged and unstaged layers

That last step is why nothing has to be pushed at the page. It reads the cart.

### Content that only exists in the browser

A listing is built from what the backend returns, so something written in the
browser appears nowhere, and the work looks lost. `lib/preview.mjs` puts it
back: staged resources are seeded into Druxt's store marked complete, so
`DruxtEntity` renders them instead of asking the backend for a uuid it has never
heard of, and rows are injected into the view's own `resource.data`, which is
where its `results` are computed from.

Which listings accept which content is decided from the types a view is already
returning, and from the view's own filters when it is returning nothing. An
empty listing was the case this exists for and the one it could not do.

It cannot evaluate a view's filters properly; that needs Drupal. It reads plain
boolean filters where the content actually carries the field, and otherwise
shows the content and marks it as not published.

## The pieces

| Where                                     | What                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `store/authoringCart.js`                  | staged and unstaged layers, and every decision about what is in them              |
| `lib/cart.mjs`                            | what changed, what depends on what, what to send and where                        |
| `lib/preview.mjs`                         | showing content that exists only in the cart                                      |
| `lib/authoring.mjs`                       | finding and connecting a backend, and the OAuth exchange                          |
| `lib/github.mjs`, `lib/github-client.mjs` | signing in, opening a pull request, starting a backend                            |
| `components/Authoring*.vue`               | the drawer, the controls, the forms and the widgets                               |
| `components/druxt/**`                     | Druxt wrapper components: the edit control on every entity, and the field widgets |
| `plugins/authoring.client.js`             | connects a backend, and keeps the page showing the cart                           |

## Being lifted out

The authoring layer is deliberately separable from this site, and is intended to
become a Druxt module rather than something a site copies.

What makes that possible: everything above is either a Druxt wrapper component,
a pure module under `lib/`, or a Vuex module. None of it is reached by a page
template, and the site's own pages contain no authoring logic.

What would have to be settled first:

- **The design.** The components carry this site's Tailwind classes. A module
  needs either no opinion about appearance or a documented one.
- **The two site-specific defaults.** The session record address and the OAuth
  consumer id are derived from the repository in `nuxt.config.js`; a module
  would take them as options.
- **The Druxt wrapper names.** `components/druxt/**` overrides this site's
  components by name. A module would ship them and let a site override in turn,
  which is how Druxt is meant to work and one reason the logic lives in
  wrappers rather than in patched components.
- **What belongs to a session and what belongs to a repository.** The GitHub
  path assumes a repository holding Tome content. A module should be able to
  offer the backend path alone.
