import { NextResponse, type NextRequest } from 'next/server'
import { ensureProfile } from '@/lib/ensure-profile'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'profile-photos'
const MAX_BYTES = 5 * 1024 * 1024
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function tableOrBucketMissing(error: { code?: string; message?: string } | null) {
  const msg = error?.message ?? ''
  return error?.code === '42P01'
    || /profile_personalization/i.test(msg)
    || /bucket|storage/i.test(msg)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  await ensureProfile(supabase, user)

  let file: File | null = null
  try {
    const form = await req.formData()
    const value = form.get('photo')
    file = value instanceof File ? value : null
  } catch {
    return NextResponse.json({ error: 'Upload inválido.' }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: 'Foto obrigatória.' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Foto deve ter até 5MB.' }, { status: 400 })
  }

  const ext = MIME_TO_EXT[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Use JPG, PNG ou WebP.' }, { status: 400 })
  }

  const avatarPath = `${user.id}/avatar.${ext}`
  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(avatarPath, bytes, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    const status = tableOrBucketMissing(uploadError) ? 503 : 500
    return NextResponse.json({ error: uploadError.message }, { status })
  }

  const { data, error } = await supabase
    .from('profile_personalization')
    .upsert({ profile_id: user.id, avatar_path: avatarPath, avatar_url: null }, { onConflict: 'profile_id' })
    .select('profile_id, avatar_url, avatar_path, user_context_md, pilot_memory_md, decision_style, risk_tolerance, updated_at, pilot_memory_updated_at')
    .single()

  if (error) {
    const status = tableOrBucketMissing(error) ? 503 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(avatarPath, 60 * 60)

  return NextResponse.json({
    personalization: { ...data, avatar_url: signed?.signedUrl ?? null },
  })
}
