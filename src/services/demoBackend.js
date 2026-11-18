// Demo backend: keeps everything in this browser's localStorage.
// Used automatically when VITE_SUPABASE_URL is not set, so the site can be
// tried without any setup. It applies the same permission rules as the
// Supabase policies (owner or head may edit/delete).
import { buildDemoDatabase, DEMO_USERS } from './demoSeed.js'

const DB_KEY = 'stream-streaming-demo-db-v6' // bump when demo seed changes
const SESSION_KEY = 'stream-streaming-demo-session'

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore and reseed */
  }
  const db = buildDemoDatabase()
  save(db)
  return db
}

function save(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* storage full or blocked — data stays in memory for this tab */
  }
}

export function createDemoBackend() {
  let db = load()
  const listeners = new Set()
  const notify = () => listeners.forEach((cb) => cb())
  const delay = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120))

  const currentUserId = () => {
    try {
      return localStorage.getItem(SESSION_KEY)
    } catch {
      return null
    }
  }
  const me = () => db.profiles.find((p) => p.id === currentUserId()) ?? null
  const requireUser = () => {
    const u = me()
    if (!u) throw new Error('Please sign in first')
    return u
  }
  const canEdit = (ds) => {
    const u = requireUser()
    return u.role === 'head' || ds.owner_id === u.id
  }
  const findDs = (id) => {
    const ds = db.datasets.find((d) => d.id === id)
    if (!ds) throw new Error('Dataset not found')
    return ds
  }
  const commit = (v) => {
    save(db)
    return delay(v)
  }

  return {
    mode: 'demo',
    demoUsers: DEMO_USERS,

    async getProfile() {
      return delay(me())
    },

    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    async signInDemo(userId) {
      localStorage.setItem(SESSION_KEY, userId)
      notify()
    },

    async signIn() {
      throw new Error('Demo mode: choose a demo account below')
    },

    async signUp() {
      throw new Error('Demo mode: sign-up needs Supabase (see README)')
    },

    async signOut() {
      localStorage.removeItem(SESSION_KEY)
      notify()
    },

    resetDemo() {
      db = buildDemoDatabase()
      save(db)
    },

    async listProfiles() {
      requireUser()
      return delay(db.profiles)
    },

    async updateProfile(id, patch) {
      const u = requireUser()
      if (u.id !== id && u.role !== 'head') throw new Error('Only the lab head can edit other users')
      if ('role' in patch && u.role !== 'head') throw new Error('Only the lab head can change roles')
      const p = db.profiles.find((x) => x.id === id)
      Object.assign(p, patch)
      return commit(p)
    },

    async listDatasets() {
      requireUser()
      const counts = {}
      for (const m of db.measurements) counts[m.dataset_id] = (counts[m.dataset_id] ?? 0) + 1
      const list = db.datasets
        .map((d) => ({ ...d, row_count: counts[d.id] ?? 0 }))
        .sort((a, b) => b.sampling_date.localeCompare(a.sampling_date))
      return delay(list)
    },

    async getDataset(id) {
      requireUser()
      return delay(findDs(id))
    },

    async listMeasurements(datasetId) {
      requireUser()
      const rows = db.measurements.filter((m) => !datasetId || m.dataset_id === datasetId)
      rows.sort((a, b) => String(a.sampled_at).localeCompare(String(b.sampled_at)) || a.id - b.id)
      return delay(rows)
    },

    async createDataset(meta, rows) {
      const u = requireUser()
      const now = new Date().toISOString()
      const ds = { id: 'ds-' + crypto.randomUUID(), owner_id: u.id, created_at: now, updated_at: now, ...meta }
      db.datasets.push(ds)
      for (const r of rows) db.measurements.push({ ...r, id: db.nextId++, dataset_id: ds.id })
      return commit(ds)
    },

    async updateDataset(id, patch) {
      const ds = findDs(id)
      if (!canEdit(ds)) throw new Error('You can only edit your own datasets')
      Object.assign(ds, patch, { updated_at: new Date().toISOString() })
      return commit(ds)
    },

    async deleteDataset(id) {
      const ds = findDs(id)
      if (!canEdit(ds)) throw new Error('You can only delete your own datasets')
      db.datasets = db.datasets.filter((d) => d.id !== id)
      db.measurements = db.measurements.filter((m) => m.dataset_id !== id)
      return commit(null)
    },

    async addMeasurement(datasetId, row) {
      if (!canEdit(findDs(datasetId))) throw new Error('You can only edit your own datasets')
      const m = { ...row, id: db.nextId++, dataset_id: datasetId }
      db.measurements.push(m)
      return commit(m)
    },

    async updateMeasurement(id, patch) {
      const m = db.measurements.find((x) => x.id === id)
      if (!m) throw new Error('Row not found')
      if (!canEdit(findDs(m.dataset_id))) throw new Error('You can only edit your own datasets')
      Object.assign(m, patch)
      return commit(m)
    },

    async deleteMeasurement(id) {
      const m = db.measurements.find((x) => x.id === id)
      if (!m) throw new Error('Row not found')
      if (!canEdit(findDs(m.dataset_id))) throw new Error('You can only edit your own datasets')
      db.measurements = db.measurements.filter((x) => x.id !== id)
      return commit(null)
    },
  }
}
