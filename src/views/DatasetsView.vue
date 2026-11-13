<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api.js'
import { session, canEdit } from '../store/session.js'
import { fmtDate } from '../lib/columns.js'

const datasets = ref([])
const loading = ref(true)
const error = ref('')
const q = ref('')
const who = ref('all') // all | mine | <owner_id>
const stream = ref('')

async function load() {
  loading.value = true
  try {
    datasets.value = await api.listDatasets()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const owners = computed(() => {
  const m = new Map()
  for (const d of datasets.value) m.set(d.owner_id, `${d.researcher_name} (${d.researcher_code})`)
  return [...m.entries()]
})
const streams = computed(() => [...new Set(datasets.value.map((d) => d.stream_name).filter(Boolean))].sort())

const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return datasets.value.filter((d) => {
    if (who.value === 'mine' && d.owner_id !== session.profile.id) return false
    if (who.value !== 'all' && who.value !== 'mine' && d.owner_id !== who.value) return false
    if (stream.value && d.stream_name !== stream.value) return false
    if (!s) return true
    return [d.title, d.note, d.stream_name, d.researcher_name, d.researcher_code].some((x) => (x ?? '').toLowerCase().includes(s))
  })
})

async function remove(d) {
  if (!confirm(`Delete "${d.title}" and its ${d.row_count} samples? This cannot be undone.`)) return
  try {
    await api.deleteDataset(d.id)
    await load()
  } catch (e) {
    error.value = e.message
  }
}

const sourceLabel = { csv: 'CSV', xlsx: 'Excel', form: 'Form' }
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Datasets</h1>
        <p class="sub">Every upload by the team. Open one to see its statistics, table, charts and outliers.</p>
      </div>
      <RouterLink to="/upload" class="btn btn-primary">Upload data</RouterLink>
    </div>

    <p v-if="error" class="notice error">{{ error }}</p>

    <div class="row filters">
      <input v-model="q" class="input" placeholder="Search title, note, stream, researcher…" style="max-width: 340px" />
      <select v-model="who" class="input" style="max-width: 240px">
        <option value="all">All researchers</option>
        <option value="mine">My uploads</option>
        <option v-for="[id, name] in owners" :key="id" :value="id">{{ name }}</option>
      </select>
      <select v-model="stream" class="input" style="max-width: 200px">
        <option value="">All streams</option>
        <option v-for="s in streams" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <div v-if="loading" class="card empty">Loading…</div>
    <div v-else-if="!shown.length" class="card empty">No datasets match.</div>

    <div v-else class="list">
      <article v-for="d in shown" :key="d.id" class="card ds">
        <div class="ds-main">
          <div class="row" style="gap: 8px">
            <RouterLink :to="`/datasets/${d.id}`" class="ds-title">{{ d.title }}</RouterLink>
            <span class="badge gray">{{ sourceLabel[d.source] ?? d.source }}</span>
            <span v-if="d.owner_id === session.profile.id" class="badge">Yours</span>
          </div>
          <p class="meta">
            <span>{{ d.stream_name || 'No stream' }}</span>
            <span>Sampled {{ d.sampling_date }}</span>
            <span>{{ d.researcher_name }} · <code>{{ d.researcher_code }}</code></span>
            <span>Uploaded {{ fmtDate(d.created_at, false) }}</span>
          </p>
          <p v-if="d.note" class="note">{{ d.note }}</p>
        </div>
        <div class="ds-side">
          <div class="metric">
            <div class="value">{{ d.row_count }}</div>
            <div class="foot">samples</div>
          </div>
          <div class="row">
            <RouterLink :to="`/datasets/${d.id}`" class="btn btn-sm">Open</RouterLink>
            <button v-if="canEdit(d)" class="btn btn-sm btn-danger" @click="remove(d)">Delete</button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.filters { gap: 10px; }
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ds {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border-left: 3px solid var(--accent);
}
.ds-title {
  font-weight: 600;
  font-size: 1.02rem;
  color: var(--text);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 0.86rem;
}
.note {
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.88rem;
  max-width: 80ch;
}
.ds-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  text-align: right;
}
.ds-side .value { font-size: 1.4rem; margin: 0; }
@media (max-width: 700px) {
  .ds { flex-direction: column; }
  .ds-side { flex-direction: row; align-items: center; }
}
</style>
