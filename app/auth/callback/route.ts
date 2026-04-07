import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type') // 'recovery' | 'signup' | undefined
  const error = searchParams.get('error')

  // Handle Supabase error in URL (e.g. expired link)
  if (error) {
    if (type === 'recovery') {
      return NextResponse.redirect(
        `${origin}/auth/forgot-password?error=link_expired`,
      )
    }
    return NextResponse.redirect(`${origin}/auth/login`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      if (type === 'recovery') {
        return NextResponse.redirect(
          `${origin}/auth/forgot-password?error=link_expired`,
        )
      }
      return NextResponse.redirect(`${origin}/auth/login`)
    }

    // Recovery flow → user must set new password before accessing dashboard
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/update-password`)
    }

    // OAuth or email confirmation → go to dashboard
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  // No code and no error — shouldn't happen, send to login
  return NextResponse.redirect(`${origin}/auth/login`)
}
