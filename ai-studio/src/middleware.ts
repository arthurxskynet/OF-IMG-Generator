import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - _next/webpack-hmr (HMR requests)
     * - _nextjs_original-stack-frames (Next.js dev tools)
     * - favicon.ico (favicon file)
     * - RSC requests (containing _rsc parameter)
     */
    '/((?!api|_next/static|_next/image|_next/webpack-hmr|_nextjs_original-stack-frames|favicon.ico).*)',
  ],
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Skip middleware for RSC requests to prevent interference with React Server Components
  if (req.nextUrl.searchParams.has('_rsc')) {
    return res;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail-open in dev if env is missing/invalid to avoid hard crashes
  if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl) || !supabaseAnon) {
    return res;
  }

  try {
    const supabase = createServerClient(
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
            return req.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            res.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            res.cookies.set({ name, value: "", ...options });
          },
        },
      }
    );

    // This will refresh session cookies if needed on navigation/API requests
    await supabase.auth.getSession();
  } catch {
    // If Supabase client fails to init, continue without session (dev safety)
    return res;
  }
  return res;
}


