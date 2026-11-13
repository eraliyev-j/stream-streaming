<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api.js'
import { session } from '../store/session.js'
import { PARAMETERS, META_COLUMNS } from '../lib/parameters.js'
import { readTable, suggestMapping, buildRows, toNumber } from '../lib/parseFile.js'
import { fmt } from '../lib/stats.js'
import { fmtDate } from '../lib/columns.js'

const router = useRouter()
const today = new Date().toLocaleDateString('en-CA')

// ---------- Upload metadata (attached to every dataset) ----------
const meta = reactive({
  researcher_code: session.profile.researcher_code,
  researcher_name: session.profile.full_name,
  sampling_date: today,
  title: '',
  stream_name: '',
  note: '',
})

const method = ref('file') // 'file' | 'form'
const error = ref('')
const busy = ref(false)

// ---------- File upload ----------
const fileName = ref('')
const source = ref('csv')
const headers = ref([])
const records = ref([])
const mapping = ref({})
const dragging = ref(false)

const targetOptions = [
  ...META_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
  ...PARAMETERS.map((p) => ({ value: p.key, label: p.unit ? `${p.short} (${p.unit})` : p.short })),
  { value: 'extra', label: 'Keep as extra numeric column' },
  { value: 'ignore', label: 'Ignore' },
]

async function onFile(file) {
  if (!file) return
  error.value = ''
  try {
    const t = await readTable(file)
    if (!t.records.length) throw new Error('The file has no data rows')
    fileName.value = file.name
    source.value = t.source
    headers.value = t.headers
    records.value = t.records
    mapping.value = suggestMapping(t.headers, t.records)
    if (!meta.title) meta.title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
  } catch (e) {
    error.value = e.message
  }
}

function onDrop(e) {
  dragging.value = false
  onFile(e.dataTransfer.files[0])
}

function clearFile() {
  fileName.value = ''
  headers.value = []
  records.value = []
  mapping.value = {}
}

const duplicateTargets = computed(() => {
  const seen = {}
  for (const t of Object.values(mapping.value)) if (t !== 'extra' && t !== 'ignore') seen[t] = (seen[t] ?? 0) + 1
  return Object.keys(seen).filter((k) => seen[k] > 1)
})

const built = computed(() => (records.value.length ? buildRows(records.value, mapping.value, meta.sampling_date) : { rows: [], warnings: [] }))
const previewCols = computed(() => {
  const mapped = new Set(Object.values(mapping.value))
  return PARAMETERS.filter((p) => mapped.has(p.key))
})

// ---------- Manual form ----------
const blankSample = () => {
  const s = { site: '', time: '09:00', lat: '', lon: '' }
  for (const p of PARAMETERS) s[p.key] = ''
  return s
}
const samples = ref([blankSample()])
const formParams = ref(['temp_c', 'ph', 'do_mgl', 'ec_uscm', 'turb_ntu', 'bod_mgl'])

const formRows = computed(() =>
  samples.value
    .map((s) => {
      const row = {
        site: s.site.trim(),
        sampled_at: new Date(`${meta.sampling_date}T${s.time || '00:00'}`).toISOString(),
        lat: toNumber(s.lat),
        lon: toNumber(s.lon),
        extra: {},
      }
      let has = false
      for (const p of PARAMETERS) {
        row[p.key] = toNumber(s[p.key])
        if (row[p.key] != null) has = true
      }
      return has ? row : null
    })
    .filter(Boolean),
)

function useMyLocation(s) {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      s.lat = pos.coords.latitude.toFixed(5)
      s.lon = pos.coords.longitude.toFixed(5)
    },
    () => (error.value = 'Could not read your location (permission denied or unavailable)'),
  )
}

// ---------- Submit ----------
const rowsToSave = computed(() => (method.value === 'file' ? built.value.rows : formRows.value))

const canSubmit = computed(
  () =>
    !busy.value &&
    meta.researcher_code.trim() &&
    meta.researcher_name.trim() &&
    meta.sampling_date &&
    meta.title.trim() &&
    rowsToSave.value.length > 0 &&
    !(method.value === 'file' && duplicateTargets.value.length),
)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const ds = await api.createDataset(
      {
        researcher_code: meta.researcher_code.trim(),
        researcher_name: meta.researcher_name.trim(),
        sampling_date: meta.sampling_date,
        title: meta.title.trim(),
        stream_name: meta.stream_name.trim(),
        note: meta.note.trim(),
        source: method.value === 'file' ? source.value : 'form',
      },
      rowsToSave.value,
    )
    router.push(`/datasets/${ds.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function downloadTemplate() {
  const head = ['site', 'date', 'lat', 'lon', ...PARAMETERS.map((p) => (p.unit ? `${p.short} (${p.unit})` : p.short))]
  const example = ['ST-01', `${today} 09:30`, '35.1796', '129.0756', '18.2', '7.6', '8.4', '320', '5.1', '2.3', '5.0', '8.0', '3.1', '0.08']
  const blob = new Blob([head.join(',') + '\n' + example.join(',') + '\n'], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'stream-streaming-template.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Upload data</h1>
        <p class="sub">Every upload becomes a dataset tagged with your researcher ID, name, sampling date and note.</p>
      </div>
    </div>

    <!-- Step 1: who / when -->
    <section class="card">
      <div class="card-head">
        <h2><span class="step">1</span> Upload details</h2>
        <span class="hint">Required fields marked *</span>
      </div>
      <div class="card-pad grid grid-3">
        <label class="field"><span>Researcher ID *</span><input v-model="meta.researcher_code" class="input" required /></label>
        <label class="field"><span>Full name *</span><input v-model="meta.researcher_name" class="input" required /></label>
        <label class="field"><span>Sampling date *</span><input v-model="meta.sampling_date" type="date" class="input" required /></label>
        <label class="field"><span>Dataset title *</span><input v-model="meta.title" class="input" placeholder="e.g. Geojongcheon November survey" /></label>
        <label class="field"><span>Stream name</span><input v-model="meta.stream_name" class="input" placeholder="e.g. Geojongcheon" /></label>
        <div />
        <label class="field span-3"><span>Note</span><textarea v-model="meta.note" class="input" placeholder="Weather, flow conditions, instruments, anything unusual…" /></label>
      </div>
    </section>

    <!-- Step 2: data -->
    <section class="card">
      <div class="card-head">
        <h2><span class="step">2</span> Measurements</h2>
        <div class="seg">
          <button :class="{ on: method === 'file' }" @click="method = 'file'">CSV / Excel file</button>
          <button :class="{ on: method === 'form' }" @click="method = 'form'">Enter by hand</button>
        </div>
      </div>

      <!-- File -->
      <div v-if="method === 'file'" class="card-pad stack">
        <label
          v-if="!fileName"
          class="drop"
          :class="{ over: dragging }"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden @change="onFile($event.target.files[0])" />
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <strong>Drop a CSV or Excel file here, or click to choose</strong>
          <span class="muted small">One row per sample. Columns like Site, Date, pH, DO, EC, BOD, T-N, T-P are recognised automatically.</span>
          <button type="button" class="btn btn-sm" @click.prevent="downloadTemplate">Download CSV template</button>
        </label>

        <template v-else>
          <div class="row">
            <span class="badge">{{ source.toUpperCase() }}</span>
            <strong>{{ fileName }}</strong>
            <span class="muted small">{{ records.length }} rows · {{ headers.length }} columns</span>
            <span class="spacer" />
            <button class="btn btn-sm" @click="clearFile">Choose another file</button>
          </div>

          <div>
            <h3 style="margin-bottom: 8px">Column mapping</h3>
            <p class="muted small" style="margin-bottom: 10px">Check how each column in your file will be stored. Unrecognised numeric columns are kept as extra parameters.</p>
            <div class="map-grid">
              <div v-for="h in headers" :key="h" class="map-item">
                <code :title="h">{{ h }}</code>
                <span class="arrow">→</span>
                <select v-model="mapping[h]" class="input" :class="{ dup: duplicateTargets.includes(mapping[h]) }">
                  <option v-for="o in targetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
            </div>
            <p v-if="duplicateTargets.length" class="notice error" style="margin-top: 10px">
              Two columns are mapped to the same field: {{ duplicateTargets.join(', ') }}. Change one of them.
            </p>
          </div>

          <div v-if="built.warnings.length" class="notice warn">
            <strong>Check these values</strong> (they will be saved as empty if not numbers):
            <ul class="warn-list">
              <li v-for="w in built.warnings" :key="w">{{ w }}</li>
            </ul>
          </div>

          <div>
            <h3 style="margin-bottom: 8px">Preview <span class="muted small">(first 8 of {{ built.rows.length }} samples)</span></h3>
            <div class="table-wrap preview">
              <table class="data">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th class="num">Sampled</th>
                    <th v-for="p in previewCols" :key="p.key" class="num">{{ p.short }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in built.rows.slice(0, 8)" :key="i">
                    <td>{{ r.site || '—' }}</td>
                    <td class="num">{{ fmtDate(r.sampled_at) }}</td>
                    <td v-for="p in previewCols" :key="p.key" class="num">{{ fmt(r[p.key]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- Form -->
      <div v-else class="card-pad stack">
        <div class="row">
          <span class="muted small">Parameters to enter:</span>
          <label v-for="p in PARAMETERS" :key="p.key" class="check">
            <input v-model="formParams" type="checkbox" :value="p.key" /> {{ p.short }}
          </label>
        </div>
        <div class="table-wrap">
          <table class="data form-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Site *</th>
                <th>Time</th>
                <th>Lat / Lon</th>
                <th v-for="k in formParams" :key="k">{{ PARAMETERS.find((p) => p.key === k).short }} <span class="faint">{{ PARAMETERS.find((p) => p.key === k).unit }}</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in samples" :key="i">
                <td class="faint">{{ i + 1 }}</td>
                <td><input v-model="s.site" class="input cell" placeholder="ST-01" /></td>
                <td><input v-model="s.time" type="time" class="input cell" /></td>
                <td class="latlon">
                  <input v-model="s.lat" class="input cell" placeholder="lat" />
                  <input v-model="s.lon" class="input cell" placeholder="lon" />
                  <button type="button" class="btn btn-sm btn-ghost" title="Use my GPS location" @click="useMyLocation(s)">📍</button>
                </td>
                <td v-for="k in formParams" :key="k"><input v-model="s[k]" class="input cell" inputmode="decimal" /></td>
                <td>
                  <button v-if="samples.length > 1" class="btn btn-sm btn-ghost" title="Remove row" @click="samples.splice(i, 1)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="row">
          <button class="btn btn-sm" @click="samples.push(blankSample())">+ Add sample</button>
          <span class="muted small">{{ formRows.length }} sample{{ formRows.length === 1 ? '' : 's' }} with at least one value</span>
        </div>
      </div>
    </section>

    <p v-if="error" class="notice error">{{ error }}</p>

    <div class="row submit">
      <span class="muted small">
        {{ rowsToSave.length }} samples will be saved as
        <strong>{{ meta.title || 'untitled dataset' }}</strong> by <code>{{ meta.researcher_code }}</code>.
      </span>
      <span class="spacer" />
      <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">
        {{ busy ? 'Saving…' : 'Save dataset' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.step {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 0.78rem;
  margin-right: 8px;
  vertical-align: 1px;
}
.span-3 { grid-column: 1 / -1; }
.stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  overflow: hidden;
}
.seg button {
  border: 0;
  background: var(--surface);
  padding: 6px 12px;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--muted);
}
.seg button + button { border-left: 1px solid var(--border-strong); }
.seg button.on {
  background: var(--primary);
  color: #fff;
}
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 20px;
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--primary);
  text-align: center;
  cursor: pointer;
}
.drop:hover,
.drop.over {
  border-color: var(--accent);
  background: var(--primary-soft);
}
.drop strong { color: var(--text); }
.map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 8px 16px;
}
.map-item {
  display: grid;
  grid-template-columns: 1fr auto 1.3fr;
  align-items: center;
  gap: 8px;
}
.map-item code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
}
.map-item .input { height: 32px; font-size: 0.85rem; }
.arrow { color: var(--faint); }
.dup { border-color: var(--danger); }
.warn-list {
  margin: 6px 0 0;
  padding-left: 18px;
  max-height: 140px;
  overflow: auto;
}
.preview { border: 1px solid var(--border); border-radius: 6px; }
.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
}
.form-table td { padding: 6px 6px; }
.cell {
  height: 30px;
  width: 84px;
  font-family: var(--mono);
  font-size: 0.84rem;
  padding: 0 6px;
}
.latlon {
  display: flex;
  gap: 4px;
  align-items: center;
}
.submit {
  position: sticky;
  bottom: 0;
  background: var(--bg);
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
</style>
