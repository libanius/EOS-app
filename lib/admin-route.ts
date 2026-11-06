import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'

/** Usuário logado com e-mail em ADMIN_EMAILS, ou nulo (a rota responde 403). */
export async function requireAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}
