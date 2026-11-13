<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AnalysisWorkspace from '../components/AnalysisWorkspace.vue'
import { api } from '../services/api.js'
import { canEdit, session } from '../store/session.js'
import { fmtDate } from '../lib/columns.js'
import { PARAMETERS } from '../lib/parameters.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()

const dataset = ref(null)
const rows = ref([])
const loading = ref(true)
const error = ref('')
const message = ref('')

const editing = ref(false)
const draft = ref({})

async function load() {
  try {
    const [d, r] = await Promise.all([api.getDataset(props.id), api.listMeasurements(props.id)])
    dataset.value = d
    rows.value = r
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const editable = computed(() => canEdit(dataset.value))
const isOthers = computed(() => dataset.value && dataset.value.owner_id !== session.profile.id)

function flash(text) {
  message.value = text
  setTimeout(() => (message.value = ''), 2500)
}

function startEdit() {
  const d = dataset.value
  draft.value = {
    title: d.title,
    stream_name: d.stream_name,
    sampling_date: d.sampling_date,
    researcher_code: d.researcher_code,
    researcher_name: d.researcher_name,
    note: d.note,
  }
  editing.value = true
}

async function saveMeta() {
  try {
    dataset.value = await api.updateDataset(props.id, draft.value)
    editing.value = false
    flash('Dataset details saved')
  } catch (e) {
    error.value = e.message
  }
}

async function removeDataset() {
  if (!confirm(`Delete "${dataset.value.title}" and all ${rows.value.length} samples? This cannot be undone.`)) return
  try {
    await api.deleteDataset(props.id)
    router.push('/datasets')
  } catch (e) {
    error.value = e.message
  }
}

async function saveRow(id, patch) {
  try {
    const updated = await api.updateMeasurement(id, patch)
    rows.value = rows.value.map((r) => (r.id === id ? updated : r))
    flash('Sample updated')
  } catch (e) {
    error.value = e.message
  }
}

async function removeRow(id) {
  try {
    await api.deleteMeasurement(id)
    rows.value = rows.value.filter((r) => r.id !== id)
    flash('Sample deleted')
  } catch (e) {
    error.value = e.message
  }
}

async function addRow() {
  const blank = { site: 'NEW', sampled_at: new Date(dataset.value.sampling_date).toISOString(), lat: null, lon: null, extra: {} }
  for (const p of PARAMETERS) blank[p.key] = null
  try {
    const r = await api.addMeasurement(props.id, blank)
    rows.value = [...rows.value, r]
    flash('Blank sample added — find site "NEW" in the Full table tab and click Edit')
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="page">
    <RouterLink to="/datasets" class="small">← All datasets</RouterLink>

    <p v-if="error" class="notice error">{{ error }}</p>
    <div v-if="loading" class="card empty">Loading…</div>

    <template v-else-if="dataset">
      <section class="card card-pad head">
        <template v-if="!editing">
          <div class="row top">
            <div>
              <h1>{{ dataset.title }}</h1>
              <p class="meta">
                <span><b>Stream</b> {{ dataset.stream_name || '—' }}</span>
                <span><b>Sampling date</b> {{ dataset.sampling_date }}</span>
                <span><b>Researcher</b> {{ dataset.researcher_name }} · <code>{{ dataset.researcher_code }}</code></span>
                <span><b>Uploaded</b> {{ fmtDate(dataset.created_at) }}</span>
                <span v-if="dataset.updated_at !== dataset.created_at"><b>Edited</b> {{ fmtDate(dataset.updated_at) }}</span>
              </p>
            </div>
            <div v-if="editable" class="row">
              <button class="btn btn-sm" @click="addRow">Add sample</button>
              <button class="btn btn-sm" @click="startEdit">Edit details</button>
              <button class="btn btn-sm btn-danger" @click="removeDataset">Delete dataset</button>
            </div>
            <span v-else class="badge gray" title="Only the uploader or the lab head can edit">Read only</span>
          </div>
          <p v-if="dataset.note" class="note">{{ dataset.note }}</p>
          <p v-if="editable && isOthers" class="notice warn small" style="margin-top: 12px">
            You are editing another researcher's dataset with lab-head rights.
          </p>
        </template>

        <form v-else class="edit" @submit.prevent="saveMeta">
          <div class="grid grid-3">
            <label class="field"><span>Title</span><input v-model="draft.title" class="input" required /></label>
            <label class="field"><span>Stream</span><input v-model="draft.stream_name" class="input" /></label>
            <label class="field"><span>Sampling date</span><input v-model="draft.sampling_date" type="date" class="input" required /></label>
            <label class="field"><span>Researcher ID</span><input v-model="draft.researcher_code" class="input" required /></label>
            <label class="field"><span>Researcher name</span><input v-model="draft.researcher_name" class="input" required /></label>
          </div>
          <label class="field"><span>Note</span><textarea v-model="draft.note" class="input" /></label>
          <div class="row">
            <button class="btn btn-primary">Save</button>
            <button type="button" class="btn" @click="editing = false">Cancel</button>
          </div>
        </form>
      </section>

      <p v-if="message" class="notice ok">{{ message }}</p>

      <AnalysisWorkspace
        :rows="rows"
        :datasets="[dataset]"
        :can-edit-row="() => editable"
        :export-name="`${dataset.title.replace(/[^\w-]+/g, '_')}.csv`"
        @save="saveRow"
        @remove="removeRow"
      />
    </template>
  </div>
</template>

<style scoped>
.head { border-top: 3px solid var(--primary); }
.top { justify-content: space-between; align-items: flex-start; }
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 22px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.88rem;
}
.meta b {
  font-weight: 500;
  color: var(--faint);
  margin-right: 4px;
}
.note {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  color: var(--muted);
  font-size: 0.9rem;
  white-space: pre-line;
}
.edit {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
