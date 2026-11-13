import Papa from 'papaparse'
import { PARAMETERS } from './parameters.js'

/** Flatten measurement rows (incl. extra columns) and download as CSV. */
export function downloadCsv(rows, filename = 'stream-data.csv', datasetsById = {}) {
  const extraKeys = [...new Set(rows.flatMap((r) => Object.keys(r.extra ?? {})))]
  const data = rows.map((r) => {
    const ds = datasetsById[r.dataset_id]
    const out = {
      dataset: ds?.title ?? '',
      stream: ds?.stream_name ?? '',
      researcher_id: ds?.researcher_code ?? '',
      researcher: ds?.researcher_name ?? '',
      site: r.site,
      sampled_at: r.sampled_at ?? '',
      lat: r.lat ?? '',
      lon: r.lon ?? '',
    }
    for (const p of PARAMETERS) out[p.key] = r[p.key] ?? ''
    for (const k of extraKeys) out[k] = r.extra?.[k] ?? ''
    return out
  })
  const csv = Papa.unparse(data)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
