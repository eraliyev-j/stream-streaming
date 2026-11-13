<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api.js'
import { refreshSession } from '../store/session.js'

const router = useRouter()
const route = useRoute()

const mode = ref('signin') // 'signin' | 'signup'
const email = ref('')
const password = ref('')
const fullName = ref('')
const researcherCode = ref('')
const busy = ref(false)
const error = ref('')
const info = ref('')

async function done() {
  await refreshSession()
  router.push(route.query.next || '/')
}

async function submit() {
  error.value = ''
  info.value = ''
  busy.value = true
  try {
    if (mode.value === 'signin') {
      await api.signIn(email.value.trim(), password.value)
      await done()
    } else {
      if (!fullName.value.trim() || !researcherCode.value.trim()) throw new Error('Full name and researcher ID are required')
      const res = await api.signUp({
        email: email.value.trim(),
        password: password.value,
        fullName: fullName.value.trim(),
        researcherCode: researcherCode.value.trim(),
      })
      if (res.needsConfirmation) {
        info.value = 'Account created. Check your email to confirm, then sign in.'
        mode.value = 'signin'
      } else {
        await done()
      }
    }
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function demoLogin(id) {
  await api.signInDemo(id)
  await done()
}
</script>

<template>
  <div class="login">
    <section class="intro">
      <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0b5e7a" />
        <path d="M5 12c3.5-3 7.5-3 11 0s7.5 3 11 0" fill="none" stroke="#9fe3f0" stroke-width="2.4" stroke-linecap="round" />
        <path d="M5 19c3.5-3 7.5-3 11 0s7.5 3 11 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
      </svg>
      <h1>Stream Streaming</h1>
      <p class="lead">
        A shared research tool for urban stream water quality. Researchers upload field and lab
        measurements; everyone on the team can browse the datasets and their descriptive statistics.
      </p>
      <ul class="facts">
        <li><strong>Upload</strong> CSV / Excel files or enter samples by hand</li>
        <li><strong>Describe</strong> mean, median, SD, quartiles, CV and skewness per parameter</li>
        <li><strong>Inspect</strong> outliers (IQR or z-score), histograms, box plots and time series</li>
        <li><strong>Export</strong> any view back to CSV</li>
      </ul>
    </section>

    <section class="card card-pad box">
      <template v-if="api.mode === 'demo'">
        <h2>Demo sign-in</h2>
        <p class="muted small">
          Supabase is not connected yet, so the site runs in demo mode with synthetic data stored in
          this browser. Choose an account to try the roles.
        </p>
        <div class="demo-list">
          <button v-for="u in api.demoUsers" :key="u.id" class="demo-user" @click="demoLogin(u.id)">
            <span>
              <strong>{{ u.full_name }}</strong>
              <span class="muted small">{{ u.researcher_code }}</span>
            </span>
            <span class="badge" :class="u.role === 'head' ? '' : 'gray'">
              {{ u.role === 'head' ? 'Lab head' : 'Researcher' }}
            </span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="tabs">
          <button class="tab" :class="{ active: mode === 'signin' }" @click="mode = 'signin'">Sign in</button>
          <button class="tab" :class="{ active: mode === 'signup' }" @click="mode = 'signup'">Create account</button>
        </div>

        <form class="form" @submit.prevent="submit">
          <template v-if="mode === 'signup'">
            <label class="field">
              <span>Full name</span>
              <input v-model="fullName" class="input" autocomplete="name" required />
            </label>
            <label class="field">
              <span>Researcher ID</span>
              <input v-model="researcherCode" class="input" placeholder="e.g. R-004" required />
            </label>
          </template>
          <label class="field">
            <span>Email</span>
            <input v-model="email" class="input" type="email" autocomplete="email" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input
              v-model="password"
              class="input"
              type="password"
              minlength="6"
              :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
              required
            />
          </label>

          <p v-if="error" class="notice error">{{ error }}</p>
          <p v-if="info" class="notice ok">{{ info }}</p>

          <button class="btn btn-primary" :disabled="busy">
            {{ busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account' }}
          </button>
          <p v-if="mode === 'signup'" class="faint small">
            New accounts are researchers. The lab head role is assigned by an administrator.
          </p>
        </form>
      </template>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 48px;
  align-items: center;
  padding: 40px 0;
}
.intro h1 {
  font-size: 2rem;
  margin: 18px 0 10px;
  letter-spacing: -0.02em;
}
.lead {
  color: var(--muted);
  font-size: 1.02rem;
  max-width: 46ch;
}
.facts {
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.facts li {
  padding-left: 18px;
  position: relative;
  color: var(--muted);
}
.facts li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 8px;
  height: 2px;
  background: var(--accent);
}
.facts strong { color: var(--text); }
.box {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 440px;
  width: 100%;
  justify-self: end;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.demo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.demo-user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.demo-user > span:first-child {
  display: flex;
  flex-direction: column;
}
.demo-user:hover {
  border-color: var(--accent);
  background: var(--primary-soft);
}
@media (max-width: 860px) {
  .login {
    grid-template-columns: 1fr;
    gap: 28px;
    min-height: auto;
  }
  .box { justify-self: stretch; max-width: none; }
}
</style>
