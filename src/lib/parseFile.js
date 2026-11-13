// Read CSV / Excel files in the browser and turn them into measurement rows.
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { matchHeader, PARAMETERS } from './parameters.js'

const NUMERIC_KEYS = new Set(['lat', 'lon', ...PARAMETERS.map((p) => p.key)])

/** Read a File object → { headers: string[], records: object[] } */
export async function readTable(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
    const text = await file.text()
    const res = Papa.parse(text.replace(/^﻿/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    })
    return { headers: res.meta.fields ?? [], records: res.data, source: 'csv' }
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
    const headers = records.length ? Object.keys(records[0]).map((h) => h.trim()) : []
    return { headers, records, source: 'xlsx' }
  }
  throw new Error('Unsupported file type. Please upload .csv, .xlsx or .xls')
}

/** Suggest a mapping for each header: standard key, 'extra' or 'ignore'. */
export function suggestMapping(headers, records) {
  const mapping = {}
  const used = new Set()
  for (const h of headers) {
    const key = matchHeader(h)
    if (key && !used.has(key)) {
      mapping[h] = key
      used.add(key)
    } else {
      // Unknown column: keep as extra if it is mostly numeric
      const sample = records.slice(0, 50).map((r) => toNumber(r[h])).filter((v) => v != null)
      mapping[h] = sample.length >= Math.min(3, records.length) ? 'extra' : 'ignore'
    }
  }
  return mapping
}

/** "7,25" → 7.25, "" → null, "n.d." → null */
export function toNumber(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim()
  if (!s) return null
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.') // European decimal comma
  s = s.replace(/[<>]/g, '') // "<0.01" detection-limit values → 0.01
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Excel serial / Date / string → ISO string or null */
export function toIsoDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (typeof v === 'number') {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const s = String(v).trim().replace(/\./g, '-')
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Apply the mapping → rows ready to save.
 * Returns { rows, warnings }
 */
export function buildRows(records, mapping, fallbackDate) {
  const rows = []
  const warnings = []
  records.forEach((rec, i) => {
    const row = { site: '', sampled_at: null, lat: null, lon: null, extra: {} }
    for (const p of PARAMETERS) row[p.key] = null
    let hasValue = false
    for (const [header, target] of Object.entries(mapping)) {
      const raw = rec[header]
      if (target === 'ignore') continue
      if (target === 'site') row.site = raw == null ? '' : String(raw).trim()
      else if (target === 'sampled_at') {
        row.sampled_at = toIsoDate(raw)
        if (raw !== '' && raw != null && !row.sampled_at) warnings.push(`Row ${i + 2}: could not read date "${raw}"`)
      } else if (target === 'extra') {
        const n = toNumber(raw)
        if (n != null) {
          row.extra[header] = n
          hasValue = true
        }
      } else if (NUMERIC_KEYS.has(target)) {
        const n = toNumber(raw)
        if (raw !== '' && raw != null && n == null) warnings.push(`Row ${i + 2}: "${header}" is not a number ("${raw}")`)
        row[target] = n
        if (n != null && target !== 'lat' && target !== 'lon') hasValue = true
      }
    }
    if (!row.sampled_at && fallbackDate) row.sampled_at = new Date(fallbackDate).toISOString()
    if (hasValue) rows.push(row)
  })
  // Basic physical-range checks (catch typos, not real outliers)
  rows.forEach((r, i) => {
    if (r.ph != null && (r.ph < 0 || r.ph > 14)) warnings.push(`Sample ${i + 1}: pH ${r.ph} is outside 0–14`)
    for (const p of PARAMETERS) {
      if (p.key !== 'temp_c' && r[p.key] != null && r[p.key] < 0) warnings.push(`Sample ${i + 1}: ${p.short} is negative`)
    }
  })
  return { rows, warnings: warnings.slice(0, 30) }
}
