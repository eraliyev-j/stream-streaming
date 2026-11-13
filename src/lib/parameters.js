// Standard stream water-quality parameters.
// `key` is the database column; `aliases` are header names we recognise in
// uploaded CSV/Excel files (compared lowercase, without spaces/units).

export const PARAMETERS = [
  { key: 'temp_c',   label: 'Water temperature', short: 'Temp',  unit: '°C',    aliases: ['temp', 'temperature', 'watertemp', 'wt', 'tempc', 'watertemperature', '수온'] },
  { key: 'ph',       label: 'pH',                short: 'pH',    unit: '',      aliases: ['ph'] },
  { key: 'do_mgl',   label: 'Dissolved oxygen',  short: 'DO',    unit: 'mg/L',  aliases: ['do', 'dissolvedoxygen', 'domgl', '용존산소'] },
  { key: 'ec_uscm',  label: 'Conductivity',      short: 'EC',    unit: 'µS/cm', aliases: ['ec', 'conductivity', 'cond', 'spc', 'ecuscm', '전기전도도'] },
  { key: 'turb_ntu', label: 'Turbidity',         short: 'Turb.', unit: 'NTU',   aliases: ['turbidity', 'turb', 'ntu', 'turbntu', '탁도'] },
  { key: 'bod_mgl',  label: 'BOD',               short: 'BOD',   unit: 'mg/L',  aliases: ['bod', 'bod5', 'bodmgl'] },
  { key: 'cod_mgl',  label: 'COD',               short: 'COD',   unit: 'mg/L',  aliases: ['cod', 'codmn', 'codcr', 'codmgl'] },
  { key: 'tss_mgl',  label: 'Suspended solids',  short: 'TSS',   unit: 'mg/L',  aliases: ['tss', 'ss', 'suspendedsolids', 'tssmgl'] },
  { key: 'tn_mgl',   label: 'Total nitrogen',    short: 'T-N',   unit: 'mg/L',  aliases: ['tn', 't-n', 'totalnitrogen', 'tnmgl', '총질소'] },
  { key: 'tp_mgl',   label: 'Total phosphorus',  short: 'T-P',   unit: 'mg/L',  aliases: ['tp', 't-p', 'totalphosphorus', 'tpmgl', '총인'] },
]

// Non-numeric / location columns
export const META_COLUMNS = [
  { key: 'site',       label: 'Site',      aliases: ['site', 'siteid', 'station', 'stationid', 'point', 'location', '지점'] },
  { key: 'sampled_at', label: 'Sampled',   aliases: ['date', 'datetime', 'time', 'sampledat', 'sampledate', 'timestamp', '일시', '날짜'] },
  { key: 'lat',        label: 'Latitude',  aliases: ['lat', 'latitude', 'y'] },
  { key: 'lon',        label: 'Longitude', aliases: ['lon', 'lng', 'long', 'longitude', 'x'] },
]

export const PARAM_BY_KEY = Object.fromEntries(PARAMETERS.map((p) => [p.key, p]))

/** Normalise a header: lowercase, drop units in brackets, spaces, _ . / */
export function normaliseHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[\s_./°µ-]/g, '')
    .trim()
}

/** Find which standard column a file header maps to, or null. */
export function matchHeader(header) {
  const n = normaliseHeader(header)
  if (!n) return null
  // Also try without a trailing unit, e.g. "BOD5 mg/L" → "bod5mgl" → "bod5"
  const candidates = [n, n.replace(/(mgl|uscm|mscm|ntu)$/, '')].filter(Boolean)
  for (const c of [...META_COLUMNS, ...PARAMETERS]) {
    const names = [c.key, ...c.aliases].map((a) => a.replace(/[\s_\-./]/g, ''))
    if (candidates.some((x) => names.includes(x))) return c.key
  }
  return null
}

/** Readable label with unit, e.g. "DO (mg/L)" */
export function paramLabel(key) {
  const p = PARAM_BY_KEY[key]
  if (p) return p.unit ? `${p.short} (${p.unit})` : p.short
  return key // extra column — show as-is
}

/**
 * Korean river water-quality standard (하천 생활환경기준), used as a reference
 * grade for each sample. Thresholds are upper limits for grades Ia → V;
 * anything above the last limit is grade VI.
 */
export const KR_GRADES = ['Ia', 'Ib', 'II', 'III', 'IV', 'V', 'VI']
export const KR_LIMITS = {
  bod_mgl: [1, 2, 3, 5, 8, 10],
  tp_mgl: [0.02, 0.04, 0.1, 0.2, 0.3, 0.5],
}

/** Grade a sample by BOD (the main organic-pollution indicator). */
export function gradeByBod(bod) {
  if (bod == null || Number.isNaN(bod)) return null
  const limits = KR_LIMITS.bod_mgl
  const i = limits.findIndex((lim) => bod <= lim)
  return KR_GRADES[i === -1 ? limits.length : i]
}
