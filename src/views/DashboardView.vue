<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api.js'
import { session } from '../store/session.js'
import { fmtDate } from '../lib/columns.js'

const datasets = ref([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    datasets.value = await api.listDatasets()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const totalSamples = computed(() => datasets.value.reduce((a, d) => a + d.row_count, 0))
const researchers = computed(() => new Set(datasets.value.map((d) => d.owner_id)).size)
const streams = computed(() => new Set(datasets.value.map((d) => d.stream_name).filter(Boolean)).size)
const mine = computed(() => datasets.value.filter((d) => d.owner_id === session.profile.id))
const recent = computed(() => [...datasets.value].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6))
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Welcome, {{ session.profile.full_name || 'researcher' }}</h1>
        <p class="sub">
          {{ session.isHead ? 'You are the lab head: you can edit and delete every dataset.' : 'You can upload data and edit or delete your own uploads.' }}
        </p>
      </div>
      <div class="row">
        <RouterLink to="/explore" class="btn">Explore all data</RouterLink>
        <RouterLink to="/upload" class="btn btn-primary">Upload data</RouterLink>
      </div>
    </div>

    <p v-if="error" class="notice error">{{ error }}</p>

    <div class="grid grid-4">
      <div class="card card-pad metric">
        <div class="label">Datasets</div>
        <div class="value">{{ loading ? '…' : datasets.length }}</div>
        <div class="foot">{{ mine.length }} uploaded by you</div>
      </div>
      <div class="card card-pad metric">
        <div class="label">Samples</div>
        <div class="value">{{ loading ? '…' : totalSamples.toLocaleString() }}</div>
        <div class="foot">measurement rows</div>
      </div>
      <div class="card card-pad metric">
        <div class="label">Streams</div>
        <div class="value">{{ loading ? '…' : streams }}</div>
        <div class="foot">urban reaches covered</div>
      </div>
      <div class="card card-pad metric">
        <div class="label">Contributors</div>
        <div class="value">{{ loading ? '…' : researchers }}</div>
        <div class="foot">researchers with uploads</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <h2>Recent uploads</h2>
        <RouterLink to="/datasets" class="small">All datasets →</RouterLink>
      </div>
      <div v-if="loading" class="empty">Loading…</div>
      <div v-else-if="!recent.length" class="empty">
        No datasets yet. <RouterLink to="/upload">Upload the first one.</RouterLink>
      </div>
      <div v-else class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Stream</th>
              <th>Researcher</th>
              <th>Sampling date</th>
              <th class="num">Samples</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in recent" :key="d.id">
              <td><RouterLink :to="`/datasets/${d.id}`"><strong>{{ d.title }}</strong></RouterLink></td>
              <td>{{ d.stream_name || '—' }}</td>
              <td>
                {{ d.researcher_name }} <span class="faint small">{{ d.researcher_code }}</span>
                <span v-if="d.owner_id === session.profile.id" class="badge" style="margin-left: 6px">You</span>
              </td>
              <td class="num">{{ d.sampling_date }}</td>
              <td class="num">{{ d.row_count }}</td>
              <td class="num faint">{{ fmtDate(d.created_at, false) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card card-pad how">
      <h2>How this tool works</h2>
      <ol>
        <li><strong>Upload</strong> a CSV/Excel file from the field or lab, or type samples into the form. Your researcher ID, name, sampling date and a note are attached to every upload.</li>
        <li><strong>Observe</strong> any dataset — or all of them together — as descriptive statistics, a full table, charts and an outlier report.</li>
        <li><strong>Correct</strong> mistakes: you can edit or delete your own uploads; the lab head can edit everything.</li>
        <li><strong>Export</strong> the data as CSV for SPSS, R, Python or Excel.</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.how ol {
  margin: 12px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
  color: var(--muted);
}
.how strong { color: var(--text); }
</style>
