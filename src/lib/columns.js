// Helpers to treat standard + extra columns the same way in analysis views.
import { PARAMETERS, PARAM_BY_KEY } from './parameters.js'

export const EXTRA_PREFIX = 'extra.'

/** Copy extra columns to top level as "extra.<name>" so stats code can read them. */
export function flattenRows(rows) {
  return rows.map((r) => {
    const flat = { ...r }
    for (const [k, v] of Object.entries(r.extra ?? {})) flat[EXTRA_PREFIX + k] = v
    return flat
  })
}

/** Numeric columns that actually contain data, standard ones first. */
export function numericColumns(rows) {
  const std = PARAMETERS.map((p) => p.key).filter((k) => rows.some((r) => Number.isFinite(r[k])))
  const extra = [...new Set(rows.flatMap((r) => Object.keys(r.extra ?? {})))].sort().map((k) => EXTRA_PREFIX + k)
  return [...std, ...extra]
}

export function colLabel(key) {
  if (key.startsWith(EXTRA_PREFIX)) return key.slice(EXTRA_PREFIX.length)
  const p = PARAM_BY_KEY[key]
  return p ? p.short : key
}

export function colUnit(key) {
  return PARAM_BY_KEY[key]?.unit ?? ''
}

export function colLong(key) {
  const p = PARAM_BY_KEY[key]
  if (!p) return colLabel(key)
  return p.unit ? `${p.label} (${p.unit})` : p.label
}

export function fmtDate(iso, withTime = true) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-CA') // YYYY-MM-DD
  if (!withTime) return date
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return time === '00:00' ? date : `${date} ${time}`
}

// Colour-blind-friendly series palette (Okabe–Ito inspired, tuned for white bg)
export const SERIES_COLORS = ['#0b5e7a', '#d1832b', '#2e9a6e', '#b6467a', '#5b6fd6', '#8a6d3b', '#3aa6c9', '#7a7a7a']
