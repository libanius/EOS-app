/**
 * GET /api/checklist — servido por `requirements` (PREP-T10d / D-176).
 *
 * Cutover: `requirements` é a verdade; `checklists` virou retrato congelado
 * para rollback. Nenhuma tela precisou mudar junto — a forma da resposta é a
 * mesma, com dois campos novos e autoritativos (`kit_slug`, `provenance`) ao
 * lado do `kit_type` sintetizado para as telas legadas.
 *
 * Reverter: trocar `readRequirements` pela leitura de `checklists`. O retrato
 * congelado é do momento do cutover; o que mudou depois dele não volta.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readRequirements } from '@/lib/requirements-read'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { items, error } = await readRequirements(supabase, user.id)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ items })
}
