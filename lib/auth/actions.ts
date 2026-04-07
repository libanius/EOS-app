'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/auth/utils'

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export async function signUp(formData: {
  name: string
  email: string
  password: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: { full_name: formData.name },
      emailRedirectTo: `${getSiteUrl()}/auth/callback?type=signup`,
    },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: 'Este e-mail já está em uso.' }
    }
    return { error: error.message }
  }

  return { error: null }
}

// ─── Sign In ──────────────────────────────────────────────────────────────────

export async function signIn(formData: {
  email: string
  password: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  })

  if (error) {
    return { error: 'E-mail ou senha incorretos.' }
  }

  redirect('/dashboard')
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

export async function forgotPassword(formData: {
  email: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?type=recovery`,
  })

  // Never reveal whether the email exists (RN-02)
  if (error) {
    // Log for monitoring but return generic success to client
    console.error('[forgotPassword]', error.message)
  }

  return { error: null }
}

// ─── Update Password ──────────────────────────────────────────────────────────

export async function updatePassword(formData: {
  newPassword: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: formData.newPassword,
  })

  if (error) {
    return { error: 'Não foi possível atualizar a senha. Tente novamente.' }
  }

  redirect('/dashboard')
}
