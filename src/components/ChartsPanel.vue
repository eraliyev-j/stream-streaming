<script setup>
import { computed, ref, watch } from 'vue'
import BaseChart from './BaseChart.vue'
import { cleanNumbers, histogram, describe, pearson, fmt } from '../lib/stats.js'
import { colLabel, colLong, SERIES_COLORS } from '../lib/columns.js'

const props = defineProps({
  rows: { type: Array, required: true }, // flattened rows
  columns: { type: Array, required: true },
  datasetsById: { type: Object, default: () => ({}) },
})

const param = ref(props.columns.includes('do_mgl') ? 'do_mgl' : props.columns[0])
const groupBy = ref('site')
const xParam = ref(props.columns.includes('bod_mgl') ? 'bod_mgl' : props.columns[0])
const yParam = ref(props.columns.includes('do_mgl') ? 'do_mgl' : props.columns[1] ?? props.columns[0])

watch(
  () => props.columns,
  (cols) => {
    if (!cols.includes(param.value)) param.value = cols[0]
    if (!cols.includes(xParam.value)) xParam.value = cols[0]
    if (!cols.includes(yParam.value)) yParam.value = cols[1] ?? cols[0]
  },
)

const groupName = (r) => {
  if (groupBy.value === 'site') return r.site || '(no site)'
  if (groupBy.value === 'dataset') return props.datasetsById[r.dataset_id]?.title ?? 'Dataset'
  if (groupBy.value === 'stream') return props.datasetsById[r.dataset_id]?.stream_name || '(no stream)'
  return 'All samples'
}

const groups = computed(() => {
  const map = new Map()
  for (const r of props.rows) {
    const g = groupName(r)
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(r)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})

const stat = computed(() => describe(props.rows.map((r) => r[param.value])))

// ---------- Histogram ----------
const histData = computed(() => {
  const h = histogram(props.rows.map((r) => r[param.value]))
  return {
    labels: h.labels,
    datasets: [{ label: 'Samples', data: h.counts, backgroundColor: '#17a2b8', borderRadius: 2, barPercentage: 1, categoryPercentage: 0.96 }],
  }
})
const histOptions = computed(() => ({
  plugins: { legend: { display: false } },
  scales: {
    x: { title: { display: true, text: colLong(param.value) }, grid: { display: false } },
    y: { title: { display: true, text: 'Count' }, beginAtZero: true, ticks: { precision: 0 } },
  },
}))

// ---------- Box plot ----------
const boxData = computed(() => ({
  labels: groups.value.map(([g]) => g),
  datasets: [
    {
      label: colLabel(param.value),
      data: groups.value.map(([, rs]) => cleanNumbers(rs.map((r) => r[param.value]))),
      backgroundColor: 'rgba(11, 94, 122, 0.14)',
      borderColor: '#0b5e7a',
      borderWidth: 1.5,
      outlierBackgroundColor: '#b83a26',
      outlierBorderColor: '#b83a26',
      outlierRadius: 3.5,
      medianColor: '#d1832b',
      itemRadius: 0,
      coef: 1.5, // whiskers at 1.5·IQR, same rule as the outlier table
    },
  ],
}))
const boxOptions = computed(() => ({
  plugins: { legend: { display: false } },
  scales: { y: { title: { display: true, text: colLong(param.value) } }, x: { grid: { display: false } } },
}))

// ---------- Time series ----------
const timeData = computed(() => ({
  datasets: groups.value.map(([g, rs], i) => ({
    label: g,
    data: rs
      .filter((r) => r.sampled_at && Number.isFinite(r[param.value]))
      .map((r) => ({ x: new Date(r.sampled_at).getTime(), y: r[param.value] }))
      .sort((a, b) => a.x - b.x),
    borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
    backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
    borderWidth: 1.6,
    pointRadius: 2.5,
    showLine: true,
    tension: 0.15,
  })),
}))
const timeOptions = computed(() => ({
  interaction: { mode: 'nearest', intersect: false },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } },
    tooltip: {
      callbacks: {
        title: (items) => new Date(items[0].parsed.x).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
        label: (item) => `${item.dataset.label}: ${fmt(item.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      type: 'linear',
      ticks: { callback: (v) => new Date(v).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }), maxTicksLimit: 10 },
      grid: { display: false },
    },
    y: { title: { display: true, text: colLong(param.value) } },
  },
}))

// ---------- Scatter / correlation ----------
const corr = computed(() => pearson(props.rows, xParam.value, yParam.value))
const scatterData = computed(() => ({
  datasets: groups.value.map(([g, rs], i) => ({
    label: g,
    data: rs
      .filter((r) => Number.isFinite(r[xParam.value]) && Number.isFinite(r[yParam.value]))
      .map((r) => ({ x: r[xParam.value], y: r[yParam.value] })),
    backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] + 'cc',
    pointRadius: 3.5,
  })),
}))
const scatterOptions = computed(() => ({
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } },
  scales: {
    x: { title: { display: true, text: colLong(xParam.value) } },
    y: { title: { display: true, text: colLong(yParam.value) } },
  },
}))

// ---------- Correlation matrix ----------
const matrixCols = computed(() => props.columns.slice(0, 12))
const matrix = computed(() =>
  matrixCols.value.map((a) => matrixCols.value.map((b) => (a === b ? 1 : pearson(props.rows, a, b).r))),
)
function corrStyle(r) {
  if (r == null) return {}
  const a = Math.min(1, Math.abs(r))
  const rgb = r >= 0 ? '11, 94, 122' : '184, 58, 38'
  return { background: `rgba(${rgb}, ${a * 0.55})`, color: a > 0.6 ? '#fff' : 'inherit' }
}
</script>

<template>
  <div class="charts">
    <div class="row controls">
      <label class="field">
        <span>Parameter</span>
        <select v-model="param" class="input">
          <option v-for="c in columns" :key="c" :value="c">{{ colLong(c) }}</option>
        </select>
      </label>
      <label class="field">
        <span>Group by</span>
        <select v-model="groupBy" class="input">
          <option value="site">Site</option>
          <option value="dataset">Dataset</option>
          <option value="stream">Stream</option>
          <option value="none">No grouping</option>
        </select>
      </label>
      <div class="quick">
        <span>n <b class="num">{{ stat.n }}</b></span>
        <span>mean <b class="num">{{ fmt(stat.mean) }}</b></span>
        <span>SD <b class="num">{{ fmt(stat.sd) }}</b></span>
        <span>median <b class="num">{{ fmt(stat.median) }}</b></span>
        <span>outliers <b class="num">{{ stat.outliers }}</b></span>
      </div>
    </div>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-head">
          <h3>Distribution</h3>
          <span class="hint">Histogram, Sturges' bins</span>
        </div>
        <div class="card-pad"><BaseChart type="bar" :data="histData" :options="histOptions" /></div>
      </section>
      <section class="card">
        <div class="card-head">
          <h3>Spread by {{ groupBy === 'none' ? 'all samples' : groupBy }}</h3>
          <span class="hint">Box = Q1–Q3, orange line = median, red dots = outliers</span>
        </div>
        <div class="card-pad"><BaseChart type="boxplot" :data="boxData" :options="boxOptions" /></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <h3>Time series</h3>
        <span class="hint">{{ colLong(param) }} over sampling time</span>
      </div>
      <div class="card-pad"><BaseChart type="scatter" :data="timeData" :options="timeOptions" :height="320" /></div>
    </section>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-head">
          <h3>Relationship</h3>
          <span class="hint">
            Pearson r = <b class="num">{{ fmt(corr.r, 3) }}</b> (n = {{ corr.n }})
          </span>
        </div>
        <div class="card-pad">
          <div class="row" style="margin-bottom: 10px">
            <select v-model="xParam" class="input pick">
              <option v-for="c in columns" :key="c" :value="c">X: {{ colLabel(c) }}</option>
            </select>
            <select v-model="yParam" class="input pick">
              <option v-for="c in columns" :key="c" :value="c">Y: {{ colLabel(c) }}</option>
            </select>
          </div>
          <BaseChart type="scatter" :data="scatterData" :options="scatterOptions" />
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Correlation matrix</h3>
          <span class="hint">Pearson r · blue positive, red negative</span>
        </div>
        <div class="table-wrap">
          <table class="data corr">
            <thead>
              <tr>
                <th></th>
                <th v-for="c in matrixCols" :key="c" class="num">{{ colLabel(c) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in matrixCols" :key="a">
                <th>{{ colLabel(a) }}</th>
                <td v-for="(b, j) in matrixCols" :key="b" class="num" :style="corrStyle(matrix[i][j])">
                  {{ fmt(matrix[i][j], 2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.charts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.controls { align-items: flex-end; gap: 14px; }
.controls .field { min-width: 220px; }
.quick {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-left: auto;
  color: var(--muted);
  font-size: 0.85rem;
  padding-bottom: 8px;
}
.quick b { color: var(--text); font-weight: 500; }
.pick { width: auto; min-width: 140px; }
.corr th,
.corr td { padding: 6px 8px; font-size: 0.78rem; }
.corr tbody th {
  position: static;
  text-transform: none;
}
</style>
