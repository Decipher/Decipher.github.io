<template>
  <div>
    <Nuxt />
    <!--
      Renders a single "Log in" control. Everything behind it - choosing a
      backend, verifying it, signing in - happens in its dialog, so a visitor
      who never clicks it sees nothing but the static site.
    -->
    <AuthoringLogin />
  </div>
</template>
