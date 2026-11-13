<script setup>
// The shared analysis area: Summary · Table · Charts · Outliers.
// Used for a single dataset and for "Explore all".
import { computed, ref } from 'vue'
import StatsTable from './StatsTable.vue'
import DataTable from './DataTable.vue'
import ChartsPanel from './ChartsPanel.vue'
import OutliersPanel from './OutliersPanel.vue'
import BaseChart from './BaseChart.vue'
import { findOutliers, fmt } from '../lib/stats.js'
import { flattenRows, numericColumns, fmtDate } from '../lib/columns.js'
import { KR_GRADES, gradeByBod } from '../lib/parameters.js'
import { downloadCsv } from '../lib/exportCsv.js'

const props = defineProps({
  rows: { type: Array, required: true },
  datasets: { type: Array, default: () => [] },
  showDataset: { type: Boolean, default: false },
  canEditRow: { type: Function, default: () => false },
  exportName: { type: String, default: 'stream-data.csv' },
})
const emit = defineEmits(['save', 'remove'])

const tab = ref('summary')
const method = ref('iqr')
const z = ref(3)

const datasetsById = computed(() => Object.fromEntries(props.datasets.map((d) => [d.id, d])))
const flat = computed(() => flattenRows(props.rows))
const columns = computed(() => numericColumns(props.rows))
const outliers = computed(() => findOutliers(flat.value, columns.value, method.value, z.value))
const outlierCells = computed(() => new Set(outliers.value.map((o) => `${props.rows[o.rowIndex].id}:${o.key}`)))

// Samples per site
const sites = computed(() => {
  const map = new Map()
  for (const r of props.rows) {
    const k = r.site || '(no site)'
    const s = map.get(k) ?? { site: k, n: 0, first: null, last: null, lat: r.lat, lon: r.lon }
    s.n++
    if (r.sampled_at) {
      if (!s.first || r.sampled_at < s.first) s.first = r.sampled_at
      if (!s.last || r.sampled_at > s.last) s.last = r.sampled_at
    }
    map.set(k, s)
  }
  return [...map.values()].sort((a, b) => a.site.localeCompare(b.site))
})

const dateRange = computed(() => {
  const ds = props.rows.map((r) => r.sampled_at).filter(Boolean).sort()
  return ds.length ? `${fmtDate(ds[0], false)} → ${fmtDate(ds[ds.length - 1], false)}` : '—'
})

// Korean river standard grade by BOD
const gradeCounts = computed(() => {
  const counts = Object.fromEntries(KR_GRADES.map((g) => [g, 0]))
  let n = 0
  for (const r of props.rows) {
    const g = gradeByBod(r.bod_mgl)
    if (g) {
      counts[g]++
      n++
    }
  }
  return { counts, n }
})
const gradeColors = ['#1f6fb2', '#3a93c9', '#4fae8a', '#9cbf4a', '#e0b23c', '#e0813c', '#c4482f']
const gradeData = computed(() => ({
  labels: KR_GRADES,
  datasets: [{ data: KR_GRADES.map((g) => gradeCounts.value.counts[g]), backgroundColor: gradeColors, borderRadius: 3 }],
}))
const gradeOptions = {
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, title: { display: true, text: 'Grade (Ia = very good … VI = very bad)' } },
    y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Samples' } },
  },
}

function exportCsv() {
  downloadCsv(props.rows, props.exportName, datasetsById.value)
}
</script>

<template>
  <div class="ws">
    <div class="row">
      <div class="tabs grow">
        <button v-for="t in ['summary', 'table', 'charts', 'outliers']" :key="t" class="tab" :class="{ active: tab === t }" @click="tab = t">
          {{ { summary: 'Descriptive stats', table: 'Full table', charts: 'Charts', outliers: `Outliers (${outliers.length})` }[t] }}
        </button>
      </div>
      <button class="btn btn-sm" @click="exportCsv">Export CSV</button>
    </div>

    <div v-if="!rows.length" class="card empty">No samples yet.</div>

    <template v-else-if="tab === 'summary'">
      <div class="grid grid-4">
        <div class="card card-pad metric">
          <div class="label">Samples</div>
          <div class="value">{{ rows.length }}</div>
          <div class="foot">{{ columns.length }} numeric parameters</div>
        </div>
        <div class="card card-pad metric">
          <div class="label">Sites</div>
          <div class="value">{{ sites.length }}</div>
          <div class="foot">{{ datasets.length }} dataset{{ datasets.length === 1 ? '' : 's' }}</div>
        </div>
        <div class="card card-pad metric">
          <div class="label">Period</div>
          <div class="value small-v">{{ dateRange }}</div>
          <div class="foot">first → last sample</div>
        </div>
        <div class="card card-pad metric">
          <div class="label">Outliers (IQR)</div>
          <div class="value">{{ findOutliers(flat, columns).length }}</div>
          <div class="foot">values outside Tukey fences</div>
        </div>
      </div>

      <section class="card">
        <div class="card-head">
          <h3>Descriptive statistics</h3>
          <span class="hint">Hover a column header for its definition</span>
        </div>
        <StatsTable :rows="flat" :columns="columns" />
      </section>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-head">
            <h3>Sampling sites</h3>
            <span class="hint">{{ sites.length }} sites</span>
          </div>
          <div class="table-wrap" style="max-height: 320px">
            <table class="data">
              <thead>
                <tr>
                  <th>Site</th>
                  <th class="num">Samples</th>
                  <th>First</th>
                  <th>Last</th>
                  <th class="num">Lat, Lon</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in sites" :key="s.site">
                  <td><strong>{{ s.site }}</strong></td>
                  <td class="num">{{ s.n }}</td>
                  <td class="num">{{ fmtDate(s.first, false) }}</td>
                  <td class="num">{{ fmtDate(s.last, false) }}</td>
                  <td class="num">{{ s.lat != null ? `${fmt(s.lat, 4)}, ${fmt(s.lon, 4)}` : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3>River grade by BOD</h3>
            <span class="hint">Korean river standard (하천 생활환경기준), reference only</span>
          </div>
          <div class="card-pad">
            <BaseChart v-if="gradeCounts.n" type="bar" :data="gradeData" :options="gradeOptions" :height="250" />
            <p v-else class="empty">No BOD values in this data.</p>
          </div>
        </section>
      </div>
    </template>

    <section v-else-if="tab === 'table'" class="card">
      <DataTable
        :rows="rows"
        :datasets-by-id="datasetsById"
        :show-dataset="showDataset"
        :can-edit-row="canEditRow"
        :outlier-cells="outlierCells"
        @save="(id, patch) => emit('save', id, patch)"
        @remove="(id) => emit('remove', id)"
      />
      <p class="legend small muted"><span class="swatch" /> Red cells are outliers ({{ method === 'iqr' ? 'IQR rule' : `|z| > ${z}` }}).</p>
    </section>

    <ChartsPanel v-else-if="tab === 'charts'" :rows="flat" :columns="columns" :datasets-by-id="datasetsById" />

    <OutliersPanel
      v-else
      v-model:method="method"
      v-model:z="z"
      :rows="flat"
      :columns="columns"
      :outliers="outliers"
      :datasets-by-id="datasetsById"
      :show-dataset="showDataset"
    />
  </div>
</template>

<style scoped>
.ws {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.grow { flex: 1; }
.small-v { font-size: 1.05rem !important; padding: 8px 0 4px; }
.legend {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--danger-soft);
  border: 1px solid #eebdb4;
}
</style>
