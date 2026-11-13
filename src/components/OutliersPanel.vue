<script setup>
import { computed } from 'vue'
import { describe, fmt } from '../lib/stats.js'
import { colLabel, colUnit, fmtDate } from '../lib/columns.js'

const props = defineProps({
  rows: { type: Array, required: true }, // flattened rows
  columns: { type: Array, required: true },
  outliers: { type: Array, required: true }, // from findOutliers
  datasetsById: { type: Object, default: () => ({}) },
  showDataset: { type: Boolean, default: false },
})
const method = defineModel('method', { default: 'iqr' })
const z = defineModel('z', { default: 3 })

const perParam = computed(() =>
  props.columns.map((key) => {
    const d = describe(props.rows.map((r) => r[key]))
    const list = props.outliers.filter((o) => o.key === key)
    return { key, d, count: list.length, high: list.filter((o) => o.direction === 'high').length }
  }),
)

const list = computed(() =>
  [...props.outliers].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).map((o) => ({ ...o, row: props.rows[o.rowIndex] })),
)
</script>

<template>
  <div class="wrap">
    <div class="card card-pad row method">
      <label class="field">
        <span>Detection method</span>
        <select v-model="method" class="input">
          <option value="iqr">Tukey fences (1.5 × IQR) — robust</option>
          <option value="zscore">z-score — assumes normal data</option>
        </select>
      </label>
      <label v-if="method === 'zscore'" class="field" style="max-width: 140px">
        <span>|z| greater than</span>
        <input v-model.number="z" type="number" step="0.5" min="1" class="input" />
      </label>
      <p class="muted small explain">
        <template v-if="method === 'iqr'">
          A value is flagged when it is below Q1 − 1.5·IQR or above Q3 + 1.5·IQR. Recommended for
          water-quality data, which is usually right-skewed (storm events, discharges).
        </template>
        <template v-else>
          z = (value − mean) / SD. A value is flagged when |z| exceeds the threshold. Extreme values
          inflate the SD itself, so this may miss outliers in small samples.
        </template>
      </p>
    </div>

    <section class="card">
      <div class="card-head">
        <h3>Outliers per parameter</h3>
        <span class="hint">{{ outliers.length }} flagged values in total</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Parameter</th>
              <th class="num">n</th>
              <th class="num">Lower fence</th>
              <th class="num">Upper fence</th>
              <th class="num">Flagged</th>
              <th class="num">High / low</th>
              <th class="num">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in perParam" :key="p.key">
              <td><strong>{{ colLabel(p.key) }}</strong> <span class="faint small">{{ colUnit(p.key) }}</span></td>
              <td class="num">{{ p.d.n }}</td>
              <td class="num">{{ method === 'iqr' ? fmt(p.d.lowerFence) : fmt(p.d.mean - z * (p.d.sd ?? 0)) }}</td>
              <td class="num">{{ method === 'iqr' ? fmt(p.d.upperFence) : fmt(p.d.mean + z * (p.d.sd ?? 0)) }}</td>
              <td class="num"><span :class="p.count ? 'badge danger' : 'faint'">{{ p.count }}</span></td>
              <td class="num">{{ p.high }} / {{ p.count - p.high }}</td>
              <td class="num">{{ p.d.n ? fmt((p.count / p.d.n) * 100, 1) + ' %' : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h3>Flagged samples</h3>
        <span class="hint">Sorted by how extreme they are</span>
      </div>
      <div v-if="!list.length" class="empty">No outliers with this method.</div>
      <div v-else class="table-wrap" style="max-height: 460px">
        <table class="data">
          <thead>
            <tr>
              <th v-if="showDataset">Dataset</th>
              <th>Site</th>
              <th>Sampled</th>
              <th>Parameter</th>
              <th class="num">Value</th>
              <th class="num">{{ method === 'iqr' ? 'IQRs outside box' : 'z' }}</th>
              <th>Direction</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(o, i) in list" :key="i">
              <td v-if="showDataset">
                <RouterLink :to="`/datasets/${o.row.dataset_id}`">{{ datasetsById[o.row.dataset_id]?.title }}</RouterLink>
              </td>
              <td><strong>{{ o.row.site || '—' }}</strong></td>
              <td class="num">{{ fmtDate(o.row.sampled_at) }}</td>
              <td>{{ colLabel(o.key) }}</td>
              <td class="num cell-out">{{ fmt(o.value) }} <span class="small">{{ colUnit(o.key) }}</span></td>
              <td class="num">{{ fmt(o.score, 2) }}</td>
              <td>
                <span class="badge" :class="o.direction === 'high' ? 'danger' : 'warn'">{{ o.direction }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.method { align-items: flex-end; gap: 16px; }
.method .field { min-width: 280px; flex: 0 0 auto; }
.explain { flex: 1; min-width: 260px; max-width: 70ch; }
</style>
