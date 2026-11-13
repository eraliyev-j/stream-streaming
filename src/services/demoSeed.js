// Synthetic demo data used only when Supabase is not configured.
// Values are generated, NOT real measurements.

export const DEMO_USERS = [
  { id: 'u-head', email: 'head@lab.demo', full_name: 'Dr. Kim Seo-yeon', researcher_code: 'LAB-HEAD', role: 'head' },
  { id: 'u-r1', email: 'r1@lab.demo', full_name: 'Lee Ji-ho', researcher_code: 'R-001', role: 'researcher' },
  { id: 'u-r2', email: 'r2@lab.demo', full_name: 'Park Min-jun', researcher_code: 'R-002', role: 'researcher' },
  { id: 'u-r3', email: 'r3@lab.demo', full_name: 'Aziza Karimova', researcher_code: 'R-003', role: 'researcher' },
]

// Small seeded random generator so the demo looks the same every time
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function normal(rand, mean, sd) {
  const u = Math.max(rand(), 1e-9)
  const v = rand()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d

function makeRows(seed, { sites, base, lat, lon, start, days, outliers = [] }) {
  const rand = rng(seed)
  const rows = []
  for (let d = 0; d < days; d++) {
    sites.forEach((site, si) => {
      const t = new Date(start)
      t.setDate(t.getDate() + d * 3)
      t.setHours(9 + si, Math.floor(rand() * 60))
      const pol = 1 + si * 0.25 // downstream sites a bit more polluted
      rows.push({
        site,
        sampled_at: t.toISOString(),
        lat: round(lat + si * 0.004 + normal(rand, 0, 0.0004), 5),
        lon: round(lon + si * 0.005 + normal(rand, 0, 0.0004), 5),
        temp_c: round(normal(rand, base.temp, 1.4), 1),
        ph: round(normal(rand, base.ph, 0.18), 2),
        do_mgl: round(Math.max(0.5, normal(rand, base.do / pol, 0.7)), 2),
        ec_uscm: round(Math.max(50, normal(rand, base.ec * pol, base.ec * 0.12)), 0),
        turb_ntu: round(Math.max(0.2, normal(rand, base.turb * pol, base.turb * 0.3)), 1),
        bod_mgl: round(Math.max(0.2, normal(rand, base.bod * pol, base.bod * 0.25)), 2),
        cod_mgl: round(Math.max(0.5, normal(rand, base.cod * pol, base.cod * 0.2)), 2),
        tss_mgl: round(Math.max(0.5, normal(rand, base.tss * pol, base.tss * 0.3)), 1),
        tn_mgl: round(Math.max(0.1, normal(rand, base.tn * pol, base.tn * 0.15)), 2),
        tp_mgl: round(Math.max(0.005, normal(rand, base.tp * pol, base.tp * 0.25)), 3),
        extra: {},
      })
    })
  }
  // Inject a few storm-event / sensor-error style outliers
  for (const [i, key, value] of outliers) if (rows[i]) rows[i][key] = value
  return rows
}

export function buildDemoDatabase() {
  const datasets = [
    {
      id: 'ds-1', owner_id: 'u-r1', researcher_code: 'R-001', researcher_name: 'Lee Ji-ho',
      title: 'Geojongcheon upstream survey', stream_name: 'Geojongcheon', sampling_date: '2026-09-15',
      note: 'Three upstream sites (GJ-01 to GJ-03). Rain on 27 Sep (expect turbidity spike).',
      source: 'csv', created_at: '2026-10-20T08:00:00Z', updated_at: '2026-10-20T08:00:00Z',
      rows: makeRows(11, {
        sites: ['GJ-01', 'GJ-02', 'GJ-03'], lat: 35.2, lon: 129.07, start: '2026-09-15', days: 12,
        base: { temp: 20, ph: 7.6, do: 8.6, ec: 320, turb: 6, bod: 2.4, cod: 5.5, tss: 9, tn: 3.2, tp: 0.09 },
        outliers: [[13, 'turb_ntu', 68.4], [13, 'tss_mgl', 96], [26, 'bod_mgl', 11.8], [31, 'ph', 9.45]],
      }),
    },
    {
      id: 'ds-2', owner_id: 'u-r2', researcher_code: 'R-002', researcher_name: 'Park Min-jun',
      title: 'Geojongcheon urban reach', stream_name: 'Geojongcheon', sampling_date: '2026-10-01',
      note: 'Mid-stream urbanised reach near combined-sewer outfalls (GJ-04, GJ-05). Weekly grab samples.',
      source: 'xlsx', created_at: '2026-10-28T05:30:00Z', updated_at: '2026-10-28T05:30:00Z',
      rows: makeRows(23, {
        sites: ['GJ-04', 'GJ-05'], lat: 35.188, lon: 129.084, start: '2026-10-01', days: 14,
        base: { temp: 17, ph: 7.3, do: 5.8, ec: 610, turb: 11, bod: 6.2, cod: 9.8, tss: 15, tn: 6.1, tp: 0.31 },
        outliers: [[7, 'do_mgl', 0.9], [18, 'ec_uscm', 2140], [22, 'tp_mgl', 1.42]],
      }),
    },
    {
      id: 'ds-3', owner_id: 'u-r3', researcher_code: 'R-003', researcher_name: 'Aziza Karimova',
      title: 'Geojongcheon downstream baseline', stream_name: 'Geojongcheon', sampling_date: '2026-10-10',
      note: 'Downstream sites GJ-06 to GJ-08. Multiparameter sonde + lab BOD/COD/T-N/T-P.',
      source: 'form', created_at: '2026-11-02T10:15:00Z', updated_at: '2026-11-02T10:15:00Z',
      rows: makeRows(37, {
        sites: ['GJ-06', 'GJ-07', 'GJ-08'], lat: 35.178, lon: 129.096, start: '2026-10-10', days: 9,
        base: { temp: 15.5, ph: 7.8, do: 7.4, ec: 450, turb: 8, bod: 3.8, cod: 7.2, tss: 11, tn: 4.4, tp: 0.17 },
        outliers: [[5, 'cod_mgl', 31.5], [20, 'temp_c', 27.9]],
      }),
    },
  ]
  let nextId = 1
  const measurements = []
  for (const ds of datasets) {
    for (const r of ds.rows) measurements.push({ id: nextId++, dataset_id: ds.id, ...r })
    delete ds.rows
  }
  return { profiles: DEMO_USERS.map((u) => ({ ...u, created_at: '2026-09-01T00:00:00Z' })), datasets, measurements, nextId }
}
