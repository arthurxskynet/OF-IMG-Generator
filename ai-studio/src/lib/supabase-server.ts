import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createServer = async () => {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl) || !supabaseAnon) {
    return createServerClient("http://invalid.local", "invalid", {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    });
  }

  try {
    return createServerClient(
      supabaseUrl,
      supabaseAnon,
      {
        global: {
          headers: {
            apikey: supabaseAnon,
          },
        },
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      }
    );
  } catch {
    return createServerClient("http://invalid.local", "invalid", {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    });
  }
};


