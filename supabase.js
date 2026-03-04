import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  window.__ENV__.SUPABASE_URL,
  window.__ENV__.SUPABASE_ANON_KEY
);
