import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body: { medical_notes?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const notes = body.medical_notes?.trim() ?? ''
  if (!notes) return NextResponse.json({ tags: [] })

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      max_tokens: 256,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a medical triage assistant. Given a free-text description of a person\'s medical conditions, return 3–6 concise condition tags in Brazilian Portuguese. Each tag is 1–4 words. Return ONLY a valid JSON array of strings, no explanation.',
        },
        {
          role: 'user',
          content: `Descrição: "${notes}"\n\nRetorne os tags como JSON array, ex: ["diabetes tipo 2", "hipertensão"]`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim() ?? '[]'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as unknown
    const tags = Array.isArray(parsed)
      ? (parsed as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 8)
      : []

    return NextResponse.json({ tags })
  } catch (err) {
    console.error('[suggest-tags]', err)
    return NextResponse.json({ tags: [] })
  }
}
