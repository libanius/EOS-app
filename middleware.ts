import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AFFILIATE_COOKIE, normalizeAffiliateCode } from '@/lib/affiliate'
import { isAdminEmail } from '@/lib/admin'

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
  // D-112: o link de convite exige conta — o middleware manda para o login com
  // `redirectTo` e traz a pessoa de volta para cá, já autenticada.
  '/convite',
  '/edu',
  '/circles',
  '/settings',
  '/weather',
  /*
   * `/mais` (NAV-T06 / D-183).
   *
   * Esta lista é ALLOW-LIST: rota que não está aqui é pública, em silêncio.
   * Quando `/settings` virou `/mais` em D-180 eu movi a página e esqueci a
   * lista — e `/mais` guarda conta, plano e cobrança, links de admin e a zona
   * de perigo com a exclusão de conta.
   *
   * Ninguém viu porque não havia nada para ver: sem sessão a tela renderiza
   * vazia e toda ação falha na RLS. O furo não era vazamento de dado, era a
   * pessoa deslogada cair numa tela de configurações em vez do login.
   */
  '/mais',
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

  if ((pathname === '/admin' || pathname.startsWith('/admin/')) && user && !isAdminEmail(user.email)) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    dashboardUrl.search = ''
    return NextResponse.redirect(dashboardUrl)
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
