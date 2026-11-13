<script setup>
import { computed } from 'vue'
import { describe, fmt } from '../lib/stats.js'
import { colLabel, colUnit } from '../lib/columns.js'

const props = defineProps({
  rows: { type: Array, required: true }, // flattened rows
  columns: { type: Array, required: true },
})

const stats = computed(() =>
  props.columns.map((key) => ({ key, ...describe(props.rows.map((r) => r[key])) })),
)

const cols = [
  { k: 'n', label: 'n', title: 'Number of valid values', digits: 0 },
  { k: 'missing', label: 'Missing', title: 'Empty / non-numeric cells', digits: 0 },
  { k: 'mean', label: 'Mean', title: 'Arithmetic mean' },
  { k: 'sd', label: 'SD', title: 'Sample standard deviation (n − 1)' },
  { k: 'cv', label: 'CV %', title: 'Coefficient of variation = SD / mean × 100', digits: 1 },
  { k: 'min', label: 'Min' },
  { k: 'q1', label: 'Q1', title: '25th percentile' },
  { k: 'median', label: 'Median', title: '50th percentile' },
  { k: 'q3', label: 'Q3', title: '75th percentile' },
  { k: 'max', label: 'Max' },
  { k: 'iqr', label: 'IQR', title: 'Interquartile range = Q3 − Q1' },
  { k: 'skew', label: 'Skew', title: 'Sample skewness (0 = symmetric, > 0 = long right tail)', digits: 2 },
  { k: 'outliers', label: 'Outliers', title: 'Values outside Q1 − 1.5·IQR … Q3 + 1.5·IQR', digits: 0 },
]
</script>

<template>
  <div class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Parameter</th>
          <th v-for="c in cols" :key="c.k" class="num" :title="c.title">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in stats" :key="s.key">
          <td>
            <strong>{{ colLabel(s.key) }}</strong>
            <span v-if="colUnit(s.key)" class="faint small" style="margin-left: 5px">{{ colUnit(s.key) }}</span>
          </td>
          <td v-for="c in cols" :key="c.k" class="num">
            <span v-if="c.k === 'outliers'" :class="s.outliers ? 'badge danger' : 'faint'">{{ s.outliers }}</span>
            <template v-else>{{ fmt(s[c.k], c.digits) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
