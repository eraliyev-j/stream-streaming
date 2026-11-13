// Picks the backend: Supabase when configured in .env, otherwise demo mode.
// Every page talks to `api` only, so both backends share the same functions.
import { createSupabaseBackend } from './supabaseBackend.js'
import { createDemoBackend } from './demoBackend.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const api = url && key ? createSupabaseBackend(url, key) : createDemoBackend()
