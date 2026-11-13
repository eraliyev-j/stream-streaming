<script setup>
import { computed, ref, watch } from 'vue'
import { fmt } from '../lib/stats.js'
import { EXTRA_PREFIX, colLabel, colUnit, fmtDate, numericColumns } from '../lib/columns.js'
import { toNumber } from '../lib/parseFile.js'

const props = defineProps({
  rows: { type: Array, required: true }, // raw measurement rows
  datasetsById: { type: Object, default: () => ({}) },
  showDataset: { type: Boolean, default: false },
  canEditRow: { type: Function, default: () => false },
  outlierCells: { type: Set, default: () => new Set() }, // "rowId:key"
})
const emit = defineEmits(['save', 'remove'])

const numCols = computed(() => numericColumns(props.rows))
const search = ref('')
const sortKey = ref('sampled_at')
const sortDir = ref(1)
const page = ref(0)
const pageSize = 50

const value = (r, key) => (key.startsWith(EXTRA_PREFIX) ? r.extra?.[key.slice(EXTRA_PREFIX.length)] : r[key])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = props.rows
  if (q) {
    list = list.filter((r) => {
      const ds = props.datasetsById[r.dataset_id]
      return [r.site, ds?.title, ds?.stream_name, ds?.researcher_code].some((s) => String(s ?? '').toLowerCase().includes(q))
    })
  }
  const k = sortKey.value
  return [...list].sort((a, b) => {
    const va = value(a, k)
    const vb = value(b, k)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir.value
  })
})

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const visible = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
watch([search, () => props.rows.length], () => (page.value = 0))

function sortBy(k) {
  if (sortKey.value === k) sortDir.value *= -1
  else {
    sortKey.value = k
    sortDir.value = 1
  }
}

// ----- inline editing -----
const editingId = ref(null)
const draft = ref({})

function startEdit(r) {
  editingId.value = r.id
  // datetime-local inputs want local time "YYYY-MM-DDTHH:mm", not UTC ISO
  const local = (iso) => {
    const t = new Date(iso)
    return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const d = { site: r.site, sampled_at: r.sampled_at ? local(r.sampled_at) : '' }
  for (const k of ['lat', 'lon', ...numCols.value]) d[k] = value(r, k) ?? ''
  draft.value = d
}

function saveEdit(r) {
  const patch = { site: draft.value.site.trim(), sampled_at: draft.value.sampled_at ? new Date(draft.value.sampled_at).toISOString() : null }
  const extra = { ...(r.extra ?? {}) }
  for (const k of ['lat', 'lon', ...numCols.value]) {
    const n = toNumber(draft.value[k])
    if (k.startsWith(EXTRA_PREFIX)) {
      const name = k.slice(EXTRA_PREFIX.length)
      if (n == null) delete extra[name]
      else extra[name] = n
    } else patch[k] = n
  }
  patch.extra = extra
  emit('save', r.id, patch)
  editingId.value = null
}

function remove(r) {
  if (confirm(`Delete sample "${r.site || r.id}"? This cannot be undone.`)) emit('remove', r.id)
}

const anyEditable = computed(() => props.rows.some((r) => props.canEditRow(r)))
</script>

<template>
  <div>
    <div class="row toolbar">
      <input v-model="search" class="input search" placeholder="Filter by site, dataset, stream or researcher ID…" />
      <span class="spacer" />
      <span class="muted small">{{ filtered.length }} of {{ rows.length }} samples</span>
    </div>

    <div class="table-wrap scroll">
      <table class="data">
        <thead>
          <tr>
            <th v-if="showDataset" @click="sortBy('dataset_id')" class="sortable">Dataset</th>
            <th @click="sortBy('site')" class="sortable">Site <span v-if="sortKey === 'site'">{{ sortDir > 0 ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('sampled_at')" class="sortable">Sampled <span v-if="sortKey === 'sampled_at'">{{ sortDir > 0 ? '▲' : '▼' }}</span></th>
            <th class="num">Lat</th>
            <th class="num">Lon</th>
            <th v-for="k in numCols" :key="k" class="num sortable" @click="sortBy(k)" :title="colUnit(k)">
              {{ colLabel(k) }}
              <span v-if="sortKey === k">{{ sortDir > 0 ? '▲' : '▼' }}</span>
            </th>
            <th v-if="anyEditable" class="actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visible" :key="r.id">
            <template v-if="editingId === r.id">
              <td v-if="showDataset" class="muted">{{ datasetsById[r.dataset_id]?.title }}</td>
              <td><input v-model="draft.site" class="input cell" /></td>
              <td><input v-model="draft.sampled_at" type="datetime-local" class="input cell wide" /></td>
              <td><input v-model="draft.lat" class="input cell" /></td>
              <td><input v-model="draft.lon" class="input cell" /></td>
              <td v-for="k in numCols" :key="k"><input v-model="draft[k]" class="input cell" /></td>
              <td class="actions">
                <button class="btn btn-sm btn-primary" @click="saveEdit(r)">Save</button>
                <button class="btn btn-sm" @click="editingId = null">Cancel</button>
              </td>
            </template>
            <template v-else>
              <td v-if="showDataset">
                <RouterLink :to="`/datasets/${r.dataset_id}`">{{ datasetsById[r.dataset_id]?.title ?? '—' }}</RouterLink>
              </td>
              <td><strong>{{ r.site || '—' }}</strong></td>
              <td class="num-plain">{{ fmtDate(r.sampled_at) }}</td>
              <td class="num">{{ fmt(r.lat, 4) }}</td>
              <td class="num">{{ fmt(r.lon, 4) }}</td>
              <td
                v-for="k in numCols"
                :key="k"
                class="num"
                :class="{ 'cell-out': outlierCells.has(r.id + ':' + k) }"
                :title="outlierCells.has(r.id + ':' + k) ? 'Flagged as outlier' : ''"
              >
                {{ fmt(value(r, k)) }}
              </td>
              <td v-if="anyEditable" class="actions">
                <template v-if="canEditRow(r)">
                  <button class="btn btn-sm btn-ghost" @click="startEdit(r)">Edit</button>
                  <button class="btn btn-sm btn-ghost danger" @click="remove(r)">Delete</button>
                </template>
              </td>
            </template>
          </tr>
          <tr v-if="!visible.length">
            <td :colspan="numCols.length + 6" class="empty">No samples match.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pages > 1" class="row pager">
      <button class="btn btn-sm" :disabled="page === 0" @click="page--">Previous</button>
      <span class="muted small">Page {{ page + 1 }} / {{ pages }}</span>
      <button class="btn btn-sm" :disabled="page >= pages - 1" @click="page++">Next</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar { padding: 12px 16px; }
.search { max-width: 380px; }
.scroll { max-height: 560px; border-top: 1px solid var(--border); }
.sortable { cursor: pointer; user-select: none; }
.sortable:hover { color: var(--text); }
.num-plain { font-family: var(--mono); font-size: 0.82rem; }
.cell {
  height: 28px;
  min-width: 70px;
  width: 80px;
  font-family: var(--mono);
  font-size: 0.82rem;
  padding: 0 6px;
}
.cell.wide { width: 180px; }
/* Keep Edit / Delete visible while the wide table scrolls sideways */
.actions {
  text-align: right;
  position: sticky;
  right: 0;
  background: var(--surface);
  box-shadow: -1px 0 0 var(--border);
}
th.actions { z-index: 2; background: var(--surface-2); }
tr:hover .actions { background: #f5fafc; }
.danger { color: var(--danger); }
.pager { justify-content: center; padding: 12px; }
</style>
