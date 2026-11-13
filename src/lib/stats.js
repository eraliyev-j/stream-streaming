// Descriptive statistics written in plain JavaScript (no library),
// so every formula can be read and explained.

/** Keep only real numbers (drop null, '', NaN). */
export function cleanNumbers(values) {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v))
}

export function mean(xs) {
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Sample standard deviation (divides by n − 1). */
export function stdDev(xs) {
  if (xs.length < 2) return null
  const m = mean(xs)
  const ss = xs.reduce((acc, x) => acc + (x - m) ** 2, 0)
  return Math.sqrt(ss / (xs.length - 1))
}

/**
 * Quantile with linear interpolation (same method as Excel QUARTILE.INC
 * and NumPy's default). `sorted` must be ascending, p in [0, 1].
 */
export function quantile(sorted, p) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Sample skewness (adjusted Fisher–Pearson, as in Excel SKEW). */
export function skewness(xs) {
  const n = xs.length
  if (n < 3) return null
  const m = mean(xs)
  const s = stdDev(xs)
  if (!s) return 0
  const sum3 = xs.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0)
  return (n / ((n - 1) * (n - 2))) * sum3
}

/**
 * Full descriptive summary for one parameter.
 * Outliers use Tukey's fences: below Q1 − 1.5·IQR or above Q3 + 1.5·IQR.
 */
export function describe(rawValues) {
  const total = rawValues.length
  const xs = cleanNumbers(rawValues)
  const n = xs.length
  const sorted = [...xs].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q1 == null ? null : q3 - q1
  const lowerFence = iqr == null ? null : q1 - 1.5 * iqr
  const upperFence = iqr == null ? null : q3 + 1.5 * iqr
  const m = mean(xs)
  const sd = stdDev(xs)
  return {
    n,
    missing: total - n,
    mean: m,
    median: quantile(sorted, 0.5),
    sd,
    cv: m && sd != null ? (sd / Math.abs(m)) * 100 : null, // coefficient of variation, %
    min: n ? sorted[0] : null,
    max: n ? sorted[n - 1] : null,
    range: n ? sorted[n - 1] - sorted[0] : null,
    q1,
    q3,
    iqr,
    lowerFence,
    upperFence,
    skew: skewness(xs),
    outliers: iqr == null ? 0 : xs.filter((x) => x < lowerFence || x > upperFence).length,
  }
}

/**
 * Flag outliers for each row.
 * method 'iqr'    → Tukey fences (robust, good for skewed water data)
 * method 'zscore' → |z| > threshold (default 3), assumes roughly normal data
 * Returns [{ rowIndex, key, value, score, direction }]
 */
export function findOutliers(rows, keys, method = 'iqr', zThreshold = 3) {
  const found = []
  for (const key of keys) {
    const values = rows.map((r) => r[key])
    const xs = cleanNumbers(values)
    if (xs.length < 4) continue
    if (method === 'zscore') {
      const m = mean(xs)
      const sd = stdDev(xs)
      if (!sd) continue
      values.forEach((v, i) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return
        const z = (v - m) / sd
        if (Math.abs(z) > zThreshold) {
          found.push({ rowIndex: i, key, value: v, score: z, direction: z > 0 ? 'high' : 'low' })
        }
      })
    } else {
      const d = describe(values)
      values.forEach((v, i) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return
        if (v < d.lowerFence || v > d.upperFence) {
          // score = how many IQRs outside the box
          const score = v > d.upperFence ? (v - d.q3) / (d.iqr || 1) : (v - d.q1) / (d.iqr || 1)
          found.push({ rowIndex: i, key, value: v, score, direction: v > d.upperFence ? 'high' : 'low' })
        }
      })
    }
  }
  return found
}

/** Pearson correlation between two numeric columns (pairwise complete). */
export function pearson(rows, a, b) {
  const pairs = rows
    .map((r) => [r[a], r[b]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pairs.length < 3) return { r: null, n: pairs.length }
  const mx = mean(pairs.map((p) => p[0]))
  const my = mean(pairs.map((p) => p[1]))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  const denom = Math.sqrt(sxx * syy)
  return { r: denom ? sxy / denom : null, n: pairs.length }
}

/** Histogram bins using Sturges' rule: k = ⌈log2(n)⌉ + 1 */
export function histogram(rawValues) {
  const xs = cleanNumbers(rawValues)
  if (!xs.length) return { labels: [], counts: [] }
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  if (min === max) return { labels: [fmt(min)], counts: [xs.length] }
  const k = Math.ceil(Math.log2(xs.length)) + 1
  const width = (max - min) / k
  const counts = new Array(k).fill(0)
  for (const x of xs) {
    const i = Math.min(k - 1, Math.floor((x - min) / width))
    counts[i]++
  }
  const labels = counts.map((_, i) => `${fmt(min + i * width)}–${fmt(min + (i + 1) * width)}`)
  return { labels, counts }
}

/** Number formatting used across the app. */
export function fmt(v, digits) {
  if (v == null || Number.isNaN(v)) return '—'
  if (typeof v !== 'number') return String(v)
  const d = digits ?? (Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 10 ? 2 : 3)
  return Number(v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d })
}
