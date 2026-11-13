<script setup>
// Thin Vue wrapper around Chart.js: give it `type`, `data`, `options`.
import { onBeforeUnmount, onMounted, ref, watch, toRaw } from 'vue'
import { Chart, registerables } from 'chart.js'
import { BoxPlotController, BoxAndWiskers } from '@sgratzl/chartjs-chart-boxplot'

Chart.register(...registerables, BoxPlotController, BoxAndWiskers)
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif"
Chart.defaults.font.size = 12
Chart.defaults.color = '#5a6d79'
Chart.defaults.borderColor = '#e3eaee'

const props = defineProps({
  type: { type: String, required: true },
  data: { type: Object, required: true },
  options: { type: Object, default: () => ({}) },
  height: { type: Number, default: 300 },
})

const canvas = ref(null)
let chart = null

function render() {
  chart?.destroy()
  chart = new Chart(canvas.value, {
    type: props.type,
    // Chart.js mutates its data, so give it a plain copy (not Vue's reactive proxy)
    data: JSON.parse(JSON.stringify(toRaw(props.data))),
    options: { responsive: true, maintainAspectRatio: false, animation: false, ...props.options },
  })
}

onMounted(render)
watch(() => [props.type, props.data, props.options], render, { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="chart" :style="{ height: height + 'px' }">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
}
</style>
