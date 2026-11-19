import { createClient } from '@supabase/supabase-js'
import { publicConfig } from '../config/index'

export const supabase = createClient(publicConfig.supabaseUrl, publicConfig.supabasePublishableKey, {
  auth: { flowType: 'pkce', autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
})
