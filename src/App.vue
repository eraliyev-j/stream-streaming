<script setup>
import AppHeader from './components/AppHeader.vue'
import { session } from './store/session.js'
</script>

<template>
  <AppHeader v-if="session.profile" />
  <main class="container">
    <RouterView />
  </main>
</template>
