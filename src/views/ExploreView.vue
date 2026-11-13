<script setup>
import { computed, onMounted, ref } from 'vue'
import AnalysisWorkspace from '../components/AnalysisWorkspace.vue'
import { api } from '../services/api.js'
import { canEdit } from '../store/session.js'

const datasets = ref([])
const rows = ref([])
const loading = ref(true)
const error = ref('')
const selected = ref([]) // dataset ids; empty = all
const stream = ref('')
const from = ref('')
const to = ref('')

async function load() {
  try {
    const [d, r] = await Promise.all([api.listDatasets(), api.listMeasurements()])
    datasets.value = d
    rows.value = r
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const byId = computed(() => Object.fromEntries(datasets.value.map((d) => [d.id, d])))
const streams = computed(() => [...new Set(datasets.value.map((d) => d.stream_name).filter(Boolean))].sort())

const filteredRows = computed(() =>
  rows.value.filter((r) => {
    const d = byId.value[r.dataset_id]
    if (selected.value.length && !selected.value.includes(r.dataset_id)) return false
    if (stream.value && d?.stream_name !== stream.value) return false
    if (from.value && (!r.sampled_at || r.sampled_at.slice(0, 10) < from.value)) return false
    if (to.value && (!r.sampled_at || r.sampled_at.slice(0, 10) > to.value)) return false
    return true
  }),
)
const usedDatasets = computed(() => {
  const ids = new Set(filteredRows.value.map((r) => r.dataset_id))
  return datasets.value.filter((d) => ids.has(d.id))
})

function toggle(id) {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}

async function saveRow(id, patch) {
  try {
    const updated = await api.updateMeasurement(id, patch)
    rows.value = rows.value.map((r) => (r.id === id ? updated : r))
  } catch (e) {
    error.value = e.message
  }
}
async function removeRow(id) {
  try {
    await api.deleteMeasurement(id)
    rows.value = rows.value.filter((r) => r.id !== id)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Explore all data</h1>
        <p class="sub">Pool samples across datasets, filter them, and describe the combined set.</p>
      </div>
    </div>

    <p v-if="error" class="notice error">{{ error }}</p>
    <div v-if="loading" class="card empty">Loading…</div>

    <template v-else>
      <section class="card card-pad filters">
        <div class="row" style="gap: 14px; align-items: flex-end">
          <label class="field">
            <span>Stream</span>
            <select v-model="stream" class="input">
              <option value="">All streams</option>
              <option v-for="s in streams" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="field"><span>From</span><input v-model="from" type="date" class="input" /></label>
          <label class="field"><span>To</span><input v-model="to" type="date" class="input" /></label>
          <button class="btn btn-sm" @click="(selected = []), (stream = ''), (from = ''), (to = '')">Reset filters</button>
        </div>
        <div class="chips">
          <span class="muted small">Datasets:</span>
          <button v-for="d in datasets" :key="d.id" class="chip" :class="{ on: !selected.length || selected.includes(d.id) }" @click="toggle(d.id)">
            {{ d.title }} <span class="faint">{{ d.researcher_code }}</span>
          </button>
        </div>
      </section>

      <AnalysisWorkspace
        :rows="filteredRows"
        :datasets="usedDatasets"
        show-dataset
        :can-edit-row="(r) => canEdit(byId[r.dataset_id])"
        export-name="stream-streaming-all.csv"
        @save="saveRow"
        @remove="removeRow"
      />
    </template>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.filters .field { min-width: 170px; }
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chip {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 12px;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  color: var(--muted);
}
.chip.on {
  background: var(--primary-soft);
  border-color: #a9d3df;
  color: var(--primary);
}
</style>
