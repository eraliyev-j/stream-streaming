// Tiny shared state: who is signed in. (Small enough that Pinia is not needed.)
import { reactive } from 'vue'
import { api } from '../services/api.js'

export const session = reactive({
  ready: false,
  profile: null,
  get isHead() {
    return this.profile?.role === 'head'
  },
})

export async function refreshSession() {
  try {
    session.profile = await api.getProfile()
  } catch {
    session.profile = null
  }
  session.ready = true
}

/** May the signed-in user edit/delete this dataset? (UI only — server enforces too) */
export function canEdit(dataset) {
  if (!session.profile || !dataset) return false
  return session.isHead || dataset.owner_id === session.profile.id
}

api.onAuthChange(refreshSession)
