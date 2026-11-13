// Real backend: Supabase (Postgres + Auth). Permissions are enforced by the
// Row Level Security policies in supabase/schema.sql.
import { createClient } from '@supabase/supabase-js'

export function createSupabaseBackend(url, anonKey) {
  const sb = createClient(url, anonKey)

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  }

  async function getProfile() {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return null
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  // Supabase returns max 1000 rows per request, so page through.
  async function fetchAll(buildQuery) {
    const pageSize = 1000
    let from = 0
    const all = []
    for (;;) {
      const chunk = check(await buildQuery().range(from, from + pageSize - 1))
      all.push(...chunk)
      if (chunk.length < pageSize) return all
      from += pageSize
    }
  }

  return {
    mode: 'supabase',

    getProfile,

    onAuthChange(cb) {
      // setTimeout: Supabase advises not to await other calls inside this callback
      const { data } = sb.auth.onAuthStateChange(() => setTimeout(cb, 0))
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }))
    },

    async signUp({ email, password, fullName, researcherCode }) {
      const data = check(
        await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, researcher_code: researcherCode } },
        }),
      )
      // If email confirmation is on, there is no session yet
      return { needsConfirmation: !data.session }
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async listProfiles() {
      return check(await sb.from('profiles').select('*').order('created_at'))
    },

    async updateProfile(id, patch) {
      return check(await sb.from('profiles').update(patch).eq('id', id).select().single())
    },

    async listDatasets() {
      const data = check(
        await sb.from('datasets').select('*, measurements(count)').order('sampling_date', { ascending: false }),
      )
      return data.map(({ measurements, ...d }) => ({ ...d, row_count: measurements?.[0]?.count ?? 0 }))
    },

    async getDataset(id) {
      return check(await sb.from('datasets').select('*').eq('id', id).single())
    },

    async listMeasurements(datasetId) {
      return fetchAll(() => {
        let q = sb.from('measurements').select('*').order('sampled_at', { ascending: true }).order('id')
        if (datasetId) q = q.eq('dataset_id', datasetId)
        return q
      })
    },

    async createDataset(meta, rows) {
      const ds = check(await sb.from('datasets').insert(meta).select().single())
      try {
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, dataset_id: ds.id }))
          check(await sb.from('measurements').insert(chunk))
        }
      } catch (e) {
        await sb.from('datasets').delete().eq('id', ds.id) // roll back half-uploaded dataset
        throw e
      }
      return ds
    },

    async updateDataset(id, patch) {
      return check(await sb.from('datasets').update(patch).eq('id', id).select().single())
    },

    async deleteDataset(id) {
      check(await sb.from('datasets').delete().eq('id', id))
    },

    async addMeasurement(datasetId, row) {
      return check(await sb.from('measurements').insert({ ...row, dataset_id: datasetId }).select().single())
    },

    async updateMeasurement(id, patch) {
      return check(await sb.from('measurements').update(patch).eq('id', id).select().single())
    },

    async deleteMeasurement(id) {
      check(await sb.from('measurements').delete().eq('id', id))
    },
  }
}
