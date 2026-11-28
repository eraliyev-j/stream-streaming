import Papa from 'papaparse'
import { PARAMETERS } from './parameters.js'
import { saveTextFile } from './saveFile.js'

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
  return saveTextFile(filename, '\ufeff' + csv)
}
