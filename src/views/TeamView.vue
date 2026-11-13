<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api.js'
import { session, refreshSession } from '../store/session.js'

const profiles = ref([])
const datasets = ref([])
const error = ref('')
const message = ref('')
const loading = ref(true)

// Own profile editing
const myName = ref(session.profile.full_name)
const myCode = ref(session.profile.researcher_code)

async function load() {
  try {
    const [p, d] = await Promise.all([api.listProfiles(), api.listDatasets()])
    profiles.value = p
    datasets.value = d
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const stats = computed(() => {
  const s = {}
  for (const d of datasets.value) {
    s[d.owner_id] ??= { datasets: 0, samples: 0 }
    s[d.owner_id].datasets++
    s[d.owner_id].samples += d.row_count
  }
  return s
})

async function saveMine() {
  error.value = ''
  try {
    await api.updateProfile(session.profile.id, { full_name: myName.value.trim(), researcher_code: myCode.value.trim() })
    await refreshSession()
    await load()
    message.value = 'Profile saved'
    setTimeout(() => (message.value = ''), 2000)
  } catch (e) {
    error.value = e.message
  }
}

async function setRole(p, role) {
  if (p.id === session.profile.id && role !== 'head') {
    if (!confirm('Remove your own lab-head rights? You will not be able to undo this yourself.')) return
  }
  try {
    await api.updateProfile(p.id, { role })
    await refreshSession()
    await load()
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Team</h1>
        <p class="sub">Researchers in this lab and what they have contributed.</p>
      </div>
    </div>

    <p v-if="error" class="notice error">{{ error }}</p>
    <p v-if="message" class="notice ok">{{ message }}</p>

    <section class="card">
      <div class="card-head"><h2>My profile</h2></div>
      <form class="card-pad row" style="align-items: flex-end; gap: 14px" @submit.prevent="saveMine">
        <label class="field" style="min-width: 240px"><span>Full name</span><input v-model="myName" class="input" required /></label>
        <label class="field" style="min-width: 160px"><span>Researcher ID</span><input v-model="myCode" class="input" required /></label>
        <button class="btn btn-primary">Save</button>
        <span class="muted small">Used as the default on your next uploads.</span>
      </form>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Researchers</h2>
        <span class="hint">{{ session.isHead ? 'As lab head you can change roles.' : 'Roles are managed by the lab head.' }}</span>
      </div>
      <div v-if="loading" class="empty">Loading…</div>
      <div v-else class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Researcher ID</th>
              <th>Email</th>
              <th>Role</th>
              <th class="num">Datasets</th>
              <th class="num">Samples</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in profiles" :key="p.id">
              <td><strong>{{ p.full_name || '—' }}</strong> <span v-if="p.id === session.profile.id" class="badge">You</span></td>
              <td><code>{{ p.researcher_code || '—' }}</code></td>
              <td class="muted">{{ p.email }}</td>
              <td>
                <select v-if="session.isHead" class="input role" :value="p.role" @change="setRole(p, $event.target.value)">
                  <option value="researcher">Researcher</option>
                  <option value="head">Lab head</option>
                </select>
                <span v-else class="badge" :class="p.role === 'head' ? '' : 'gray'">{{ p.role === 'head' ? 'Lab head' : 'Researcher' }}</span>
              </td>
              <td class="num">{{ stats[p.id]?.datasets ?? 0 }}</td>
              <td class="num">{{ stats[p.id]?.samples ?? 0 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card card-pad">
      <h2 style="margin-bottom: 10px">Permissions</h2>
      <table class="data perms">
        <thead>
          <tr><th>Action</th><th>Researcher</th><th>Lab head</th></tr>
        </thead>
        <tbody>
          <tr><td>View all datasets, stats and charts</td><td>✓</td><td>✓</td></tr>
          <tr><td>Upload new datasets</td><td>✓</td><td>✓</td></tr>
          <tr><td>Edit / delete own datasets and samples</td><td>✓</td><td>✓</td></tr>
          <tr><td>Edit / delete anyone's datasets and samples</td><td class="faint">—</td><td>✓</td></tr>
          <tr><td>Change user roles</td><td class="faint">—</td><td>✓</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.role { height: 30px; width: 140px; font-size: 0.85rem; }
.perms td:not(:first-child),
.perms th:not(:first-child) { text-align: center; width: 120px; }
</style>
