import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AFFILIATE_COOKIE, normalizeAffiliateCode } from '@/lib/affiliate'

const PROTECTED_ROUTES = [
  '/admin',
  '/dashboard',
  '/dashboard-legacy',
  '/dashboard-world',
  '/onboarding',
  '/family',
  '/preparedness',
  '/inventory',
  '/scenario',
  '/scenario-legacy',
  '/checklist',
  '/checklist-legacy',
  '/comms',
  '/edu',
  '/circles',
  '/settings',
  '/weather',
]

// Protected only as an EXACT path. `/ficha` is the private Master Card editor,
// but `/ficha/[id]` is the PUBLIC emergency card (QR destination) and must stay
// open to unauthenticated first responders — so we must not protect the prefix.
const PROTECTED_EXACT = ['/ficha']


export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const affiliateRef = normalizeAffiliateCode(
    request.nextUrl.searchParams.get('ref') ?? request.nextUrl.searchParams.get('affiliate'),
  )

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: always call getUser() to refresh the session token (RN-03)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isProtected =
    PROTECTED_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + '/'),
    ) || PROTECTED_EXACT.includes(pathname)

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('redirectTo', `${pathname}${request.nextUrl.search}`)
    const redirect = NextResponse.redirect(loginUrl)
    if (affiliateRef) {
      redirect.cookies.set(AFFILIATE_COOKIE, affiliateRef, {
        path: '/',
        maxAge: 60 * 60 * 24 * 90,
        sameSite: 'lax',
      })
    }
    return redirect
  }

  if (affiliateRef) {
    supabaseResponse.cookies.set(AFFILIATE_COOKIE, affiliateRef, {
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
      sameSite: 'lax',
    })
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public image formats
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
