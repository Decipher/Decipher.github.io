<template>
  <!--
    A trail, not a heading.

    Druxt's breadcrumb ends on the current page, unlinked, which is a normal
    convention and useful. Unstyled it renders at the same weight as the page
    title directly beneath it, so the page appeared to say its own name twice.
    Small, muted and inline, it reads as what it is: where this page sits.
  -->
  <nav
    v-if="crumbs.length"
    class="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-dimmed"
    aria-label="Breadcrumb"
    data-testid="breadcrumb"
  >
    <template v-for="(crumb, index) of crumbs">
      <span v-if="index" :key="`sep-${index}`" aria-hidden="true">/</span>
      <NuxtLink v-if="crumb.to" :key="index" :to="crumb.to" class="no-underline hover:text-accent">{{
        crumb.text
      }}</NuxtLink>
      <!--
        The last crumb is this page. Marked as current for anything reading the
        page aloud, and not a link, because a link to here goes nowhere.
      -->
      <span v-else :key="index" aria-current="page" class="text-muted">{{ crumb.text }}</span>
    </template>
  </nav>
</template>

<script>
export default {
  name: 'DruxtBreadcrumbDefault',

  props: {
    crumbs: { type: Array, default: () => [] },
  },
}
</script>
