<script setup>
import { useRouter } from 'vue-router'
import { api } from '../services/api.js'
import { session } from '../store/session.js'

const router = useRouter()

async function signOut() {
  await api.signOut()
  session.profile = null
  router.push('/login')
}
</script>

<template>
  <header class="hdr">
    <div class="container hdr-in">
      <RouterLink to="/" class="brand">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0b5e7a" />
          <path d="M5 12c3.5-3 7.5-3 11 0s7.5 3 11 0" fill="none" stroke="#9fe3f0" stroke-width="2.4" stroke-linecap="round" />
          <path d="M5 19c3.5-3 7.5-3 11 0s7.5 3 11 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
        </svg>
        <span>Stream Streaming</span>
      </RouterLink>

      <nav class="nav">
        <RouterLink to="/" exact-active-class="on">Overview</RouterLink>
        <RouterLink to="/datasets" active-class="on">Datasets</RouterLink>
        <RouterLink to="/explore" active-class="on">Explore all</RouterLink>
        <RouterLink to="/upload" active-class="on">Upload</RouterLink>
        <RouterLink to="/team" active-class="on">Team</RouterLink>
      </nav>

      <div class="who">
        <span v-if="api.mode === 'demo'" class="badge warn" title="Data is stored in this browser only">Demo mode</span>
        <div class="who-text">
          <strong>{{ session.profile.full_name || session.profile.email }}</strong>
          <span>
            {{ session.profile.researcher_code || '—' }} ·
            {{ session.isHead ? 'Lab head' : 'Researcher' }}
          </span>
        </div>
        <button class="btn btn-sm" @click="signOut">Sign out</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hdr {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 20;
}
.hdr-in {
  display: flex;
  align-items: center;
  gap: 24px;
  min-height: 60px;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}
.brand:hover { text-decoration: none; }
.nav {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}
.nav a {
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.92rem;
  white-space: nowrap;
}
.nav a:hover {
  background: var(--surface-2);
  color: var(--text);
  text-decoration: none;
}
.nav a.on {
  background: var(--primary-soft);
  color: var(--primary);
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
}
.who-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  text-align: right;
}
.who-text strong { font-size: 0.88rem; }
.who-text span {
  font-size: 0.76rem;
  color: var(--muted);
}
@media (max-width: 900px) {
  .hdr-in { gap: 10px; padding-top: 8px; padding-bottom: 8px; }
  .nav { order: 3; flex-basis: 100%; }
  .who { margin-left: auto; }
  .who-text { display: none; }
}
</style>
