// Read CSV / Excel files in the browser and turn them into measurement rows.
//
// Two layouts are understood:
//  1. LONG  — one row per sample, one column per parameter (a normal table).
//  2. WIDE  — lab-sheet style: one block per parameter, sampling dates across
//             the columns and sites (B1, S1, …) down the rows, e.g.
//
//               Temp |    | 15/07/2025 | 30/07/2025 | …
//                    | B1 | 25.4       | 27.7       | …
//                    | S1 | 25.6       | 27.8       | …
//
//     Wide blocks from every sheet are pivoted into the long layout, so the
//     rest of the app only ever sees one row per (site, date).
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { matchHeader, PARAMETERS } from './parameters.js'

const NUMERIC_KEYS = new Set(['lat', 'lon', ...PARAMETERS.map((p) => p.key)])

// ---------------------------------------------------------------- dates ----

/** A cell → { y, m, d } if it is clearly a calendar date, else null. */
export function cellToDay(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Excel dates arrive as midnight in UTC or in local time depending on the
    // reader; shifting 12 h and reading the UTC day gives the same calendar
    // day either way, in any time zone.
    const t = new Date(v.getTime() + 12 * 3600 * 1000)
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/) // 2025-07-15
  if (m) return validDay(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T].*)?$/) // 15/07/2025 (day first)
  if (m) return validDay(+m[3], +m[2], +m[1])
  return null
}

function validDay(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = new Date(y, m - 1, d)
  return t.getMonth() === m - 1 ? { y, m, d } : null // rejects 31/02 etc.
}

const dayKey = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const dayLabel = (key) => key.split('-').reverse().join('/') // 2025-10-30 → 30/10/2025
const keyToDate = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
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
  const s = String(v).trim()
  // Day-first numeric dates (15/07/2025, 15.07.2025) with optional time
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/)
  if (m) {
    const day = validDay(+m[3], +m[2], +m[1])
    if (!day) return null
    return new Date(day.y, day.m - 1, day.d, +(m[4] ?? 0), +(m[5] ?? 0)).toISOString()
  }
  const d = new Date(s.replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/, '$1-$2-$3'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// --------------------------------------------------------------- values ----

/**
 * Classify one cell.
 *   12.3 / "12,3"  → { kind: 'num',   value }
 *   "<0.01"        → { kind: 'below', limit }   below detection limit
 *   ">0.01"        → { kind: 'above', limit }
 *   "UR", "n.d."   → { kind: 'text',  text }
 *   ""             → { kind: 'empty' }
 */
export function classifyValue(v) {
  if (v == null || v === '') return { kind: 'empty' }
  if (typeof v === 'number') return Number.isFinite(v) ? { kind: 'num', value: v } : { kind: 'empty' }
  if (v instanceof Date) return { kind: 'text', text: String(v) }
  let s = String(v).trim()
  if (!s) return { kind: 'empty' }
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.') // European decimal comma
  const lim = s.match(/^([<>])\s*(\d*\.?\d+)$/)
  if (lim) return { kind: lim[1] === '<' ? 'below' : 'above', limit: Number(lim[2]) }
  const n = Number(s)
  return Number.isFinite(n) ? { kind: 'num', value: n } : { kind: 'text', text: s }
}

/** Simple number reader used by forms and inline edits: "7,25" → 7.25, "<0.01" → 0.01 */
export function toNumber(v) {
  const c = classifyValue(v)
  if (c.kind === 'num') return c.value
  if (c.kind === 'below' || c.kind === 'above') return c.limit
  return null
}

// ------------------------------------------------------------- reading ----

/** Read a File → { headers, records, source, layout, notes } */
export async function readTable(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
    const text = await file.text()
    const res = Papa.parse(text.replace(/^﻿/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    })
    const headers = (res.meta.fields ?? []).filter(Boolean)
    return { headers, records: res.data, source: 'csv', layout: 'long', notes: [] }
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheets = wb.SheetNames.map((n) => ({
      name: n,
      aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true, blankrows: true }),
    }))
    const wide = parseWide(sheets)
    if (wide) return { ...wide, source: 'xlsx', layout: 'wide' }
    const long = parseLongSheet(sheets.find((s) => s.aoa.some((r) => r.some((c) => c !== ''))) ?? sheets[0])
    return { ...long, source: 'xlsx', layout: 'long' }
  }
  throw new Error('Unsupported file type. Please upload .csv, .xlsx or .xls')
}

/** Normal table: find the real header row (skip title rows above it). */
function parseLongSheet(sheet) {
  const aoa = sheet?.aoa ?? []
  const nonEmpty = (r) => r.filter((c) => c !== '')
  let h = aoa.findIndex((r, i) => {
    const cells = nonEmpty(r)
    if (cells.length < 2 || !cells.every((c) => typeof c === 'string')) return false
    const next = aoa.slice(i + 1).find((x) => nonEmpty(x).length)
    return next ? next.some((c) => typeof c === 'number' || c instanceof Date) : false
  })
  if (h === -1) h = aoa.findIndex((r) => nonEmpty(r).length >= 2)
  if (h === -1) return { headers: [], records: [], notes: [] }

  const cols = aoa[h].map((c, j) => ({ j, name: String(c).trim() })).filter((c) => c.name)
  const seen = {}
  for (const c of cols) {
    seen[c.name] = (seen[c.name] ?? 0) + 1
    if (seen[c.name] > 1) c.name = `${c.name} (${seen[c.name]})`
  }
  const records = aoa
    .slice(h + 1)
    .filter((r) => cols.some((c) => r[c.j] !== '' && r[c.j] != null))
    .map((r) => Object.fromEntries(cols.map((c) => [c.name, r[c.j] ?? ''])))
  const notes = h > 0 ? [`Skipped ${h} title row${h > 1 ? 's' : ''} above the column headers.`] : []
  return { headers: cols.map((c) => c.name), records, notes }
}

/** Longest run of ≥3 adjacent date cells in a row → { a, b, days } or null */
function dateRun(row) {
  const days = row.map(cellToDay)
  const runs = []
  let start = -1
  for (let j = 0; j <= days.length; j++) {
    if (j < days.length && days[j]) {
      if (start === -1) start = j
    } else if (start !== -1) {
      if (j - start >= 3) runs.push({ a: start, b: j - 1 })
      start = -1
    }
  }
  if (!runs.length) return null
  // The first run is the data; any further run is a side table (e.g. averages)
  return { ...runs[0], days, more: runs.length > 1 }
}

/** Wide lab-sheet layout across all sheets → long records, or null if not wide. */
function parseWide(sheets) {
  const cells = [] // { sheet, param, site, day, raw }
  const blocks = []
  let skippedSideTables = false

  for (const { name: sheet, aoa } of sheets) {
    for (let r = 0; r < aoa.length; r++) {
      const run = dateRun(aoa[r])
      if (!run) continue
      if (run.more) skippedSideTables = true
      const { a, b, days } = run
      const left = (row) => row.slice(0, a).map((c) => (c instanceof Date ? '' : String(c).trim())).filter(Boolean)

      let param = left(aoa[r])[0] ?? ''
      const sites = []
      let k = r + 1
      for (; k < aoa.length; k++) {
        const row = aoa[k]
        if (dateRun(row)) break // next block starts
        const labels = left(row)
        const hasValue = row.slice(a, b + 1).some((c) => c !== '' && c != null)
        if (!labels.length || !hasValue) break
        if (!param && labels.length > 1) param = labels[0] // name sits beside the first site (Gas sheet)
        const site = labels[labels.length - 1]
        sites.push(site)
        for (let j = a; j <= b; j++) {
          const raw = row[j]
          if (raw === '' || raw == null) continue
          cells.push({ sheet, param, site, day: dayKey(days[j]), raw })
        }
      }
      if (!sites.length) continue
      // cells pushed before `param` was known (Gas sheet) get it now
      for (const c of cells) if (!c.param && c.sheet === sheet) c.param = param || `Parameter ${blocks.length + 1}`
      blocks.push({ sheet, param: param || `Parameter ${blocks.length + 1}`, sites })
      r = k - 1
    }
  }
  if (!blocks.length) return null

  // Same parameter name on two sheets (NH3 on "Sheet1" and "Gas") → keep both, label by sheet
  const firstSheetOf = {}
  for (const bl of blocks) firstSheetOf[bl.param] ??= bl.sheet
  for (const c of cells) if (firstSheetOf[c.param] !== c.sheet) c.param = `${c.param} (${c.sheet})`
  for (const bl of blocks) if (firstSheetOf[bl.param] !== bl.sheet) bl.param = `${bl.param} (${bl.sheet})`

  const notes = []
  const checks = []

  // Align near-identical dates: one parameter dated 31/10 while all others say 30/10
  // is almost always a typing slip. Dates ≤ 3 days apart are merged onto the date
  // most cells use.
  const countByDay = {}
  for (const c of cells) countByDay[c.day] = (countByDay[c.day] ?? 0) + 1
  const daysSorted = Object.keys(countByDay).sort()
  const canonical = {}
  let group = []
  const flush = () => {
    if (!group.length) return
    const main = group.reduce((x, y) => (countByDay[y] > countByDay[x] ? y : x))
    for (const d of group) canonical[d] = main
    group = []
  }
  for (const d of daysSorted) {
    if (group.length && (keyToDate(d) - keyToDate(group[group.length - 1])) / 86400000 > 3) flush()
    group.push(d)
  }
  flush()
  const moved = {}
  for (const c of cells) {
    const to = canonical[c.day]
    if (to !== c.day) {
      const k = `${c.param}|${c.day}|${to}`
      moved[k] = { param: c.param, from: c.day, to }
      c.day = to
    }
  }
  for (const m of Object.values(moved)) {
    checks.push({
      level: 'warn',
      text: `${m.param}: date ${dayLabel(m.from)} differs from the other parameters (${dayLabel(m.to)}) — treated as ${dayLabel(m.to)}. Fix the sheet if it was really a different day.`,
    })
  }

  // Pivot → one record per (site, date)
  const params = [...new Set(blocks.map((b) => b.param))]
  const byKey = new Map()
  for (const c of cells) {
    const key = `${c.site}|${c.day}`
    if (!byKey.has(key)) byKey.set(key, { Site: c.site, Date: keyToDate(c.day) })
    const rec = byKey.get(key)
    if (rec[c.param] !== undefined && rec[c.param] !== c.raw) {
      checks.push({ level: 'warn', text: `${c.param}, ${c.site}, ${dayLabel(c.day)}: two different values (${rec[c.param]} and ${c.raw}); kept the first.` })
      continue
    }
    rec[c.param] = c.raw
  }
  const records = [...byKey.values()].sort((x, y) => x.Date - y.Date || x.Site.localeCompare(y.Site, 'en', { numeric: true }))

  const sheetsUsed = [...new Set(blocks.map((b) => b.sheet))]
  const allSites = [...new Set(blocks.flatMap((b) => b.sites))]
  notes.push(
    `Lab-sheet layout detected: ${blocks.length} parameter tables on ${sheetsUsed.length} sheet${sheetsUsed.length > 1 ? 's' : ''} (${blocks
      .map((b) => b.param)
      .join(', ')}), ${allSites.length} sites, ${new Set(Object.values(canonical)).size} sampling dates → ${records.length} samples.`,
  )
  if (skippedSideTables) notes.push('Summary tables to the right of the data (e.g. "Average Bottom / Surface") were skipped; averages are recalculated by the app.')

  return { headers: ['Site', 'Date', ...params], records, notes, checks }
}

// ------------------------------------------------------------- mapping ----

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
      // Unknown column: keep as extra if it holds numbers (or "<x" detection-limit values)
      const sample = records.slice(0, 200).map((r) => classifyValue(r[h]).kind)
      const numeric = sample.filter((k) => k === 'num' || k === 'below' || k === 'above').length
      mapping[h] = numeric >= Math.min(3, records.length) ? 'extra' : 'ignore'
    }
  }
  return mapping
}

// --------------------------------------------------------------- build ----

/**
 * Apply the mapping → rows ready to save.
 * options.belowLimit: how to store "<x" values
 *   'half'  → x / 2  (common substitution for values below the detection limit)
 *   'limit' → x
 *   'empty' → leave empty
 * Returns { rows, checks } where checks = [{ level: 'warn' | 'info', text }]
 */
export function buildRows(records, mapping, fallbackDate, options = {}) {
  const belowLimit = options.belowLimit ?? 'half'
  const rows = []
  const agg = new Map() // grouped messages
  const note = (level, key, text) => {
    const e = agg.get(key) ?? { level, text, count: 0, cols: new Set() }
    e.count++
    agg.set(key, e)
    return e
  }

  const store = (header, raw) => {
    const c = classifyValue(raw)
    if (c.kind === 'num') return c.value
    if (c.kind === 'empty') return null
    if (c.kind === 'below') {
      note('info', `below|${belowLimit}`, '').cols.add(header)
      if (belowLimit === 'empty') return null
      return belowLimit === 'half' ? c.limit / 2 : c.limit
    }
    if (c.kind === 'above') {
      note('warn', `above|${header}|${c.limit}`, `${header}: ">${c.limit}" stored as ${c.limit}. Check whether it should be "<${c.limit}".`)
      return c.limit
    }
    note('warn', `text|${c.text}`, c.text).cols.add(header)
    return null
  }

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
        if (raw !== '' && raw != null && !row.sampled_at) note('warn', `date|${i}`, `Row ${i + 1}: could not read the date "${raw}".`)
      } else if (target === 'extra') {
        const n = store(header, raw)
        if (n != null) {
          row.extra[header] = n
          hasValue = true
        }
      } else if (NUMERIC_KEYS.has(target)) {
        const n = store(header, raw)
        row[target] = n
        if (n != null && target !== 'lat' && target !== 'lon') hasValue = true
      }
    }
    if (!row.sampled_at && fallbackDate) row.sampled_at = new Date(fallbackDate).toISOString()
    if (hasValue) rows.push(row)
  })

  const checks = []
  for (const [key, e] of agg) {
    if (key.startsWith('below|')) {
      const how = { half: 'stored as half the limit (e.g. "<1" → 0.5)', limit: 'stored as the limit (e.g. "<1" → 1)', empty: 'left empty' }[belowLimit]
      checks.push({ level: 'info', text: `${e.count} values below the detection limit ("<x") in ${[...e.cols].join(', ')} — ${how}.` })
    } else if (key.startsWith('text|')) {
      checks.push({ level: 'warn', text: `"${e.text}" in ${e.count} cell${e.count > 1 ? 's' : ''} (${[...e.cols].join(', ')}) is not a number — left empty.` })
    } else {
      checks.push({ level: e.level, text: e.text })
    }
  }

  // Physical-range checks (typos, not genuine outliers)
  rows.forEach((r) => {
    const where = `${r.site || 'sample'} ${r.sampled_at ? r.sampled_at.slice(0, 10) : ''}`.trim()
    if (r.ph != null && (r.ph < 0 || r.ph > 14)) checks.push({ level: 'warn', text: `${where}: pH ${r.ph} is outside 0–14.` })
    if (r.temp_c != null && (r.temp_c < -5 || r.temp_c > 45)) checks.push({ level: 'warn', text: `${where}: water temperature ${r.temp_c} °C is implausible.` })
    for (const p of PARAMETERS) {
      if (p.key !== 'temp_c' && r[p.key] != null && r[p.key] < 0) checks.push({ level: 'warn', text: `${where}: ${p.short} is negative (${r[p.key]}).` })
    }
  })
  return { rows, checks }
}
