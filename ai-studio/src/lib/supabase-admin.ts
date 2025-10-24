import { createClient } from "@supabase/supabase-js";

const adminUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(
  adminUrl,
  serviceKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { apikey: serviceKey } }
  }
);


