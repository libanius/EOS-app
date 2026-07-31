/**
 * The preset vocabulary for member-to-member messages (D-073).
 *
 * Presets, not free text, and deliberately so. Under stress people do not
 * compose; they pick. A fixed vocabulary also means the recipient recognises the
 * message instantly instead of parsing a sentence — "Estou bem" reads faster
 * than anything either of them would have typed.
 *
 * Keep the list SHORT. A long list is a form, not a reflex.
 */
export const PING_PRESETS = {
  ok: { pt: 'Estou bem', en: 'I am OK' },
  where: { pt: 'Onde você está?', en: 'Where are you?' },
  come_home: { pt: 'Volte para casa agora', en: 'Come home now' },
  meet: { pt: 'Vamos ao ponto de encontro', en: 'Go to the rendezvous point' },
  execute_plan: { pt: 'Execute o plano da família agora', en: 'Run the family plan now' },
  help: { pt: 'Preciso de ajuda', en: 'I need help' },
  on_my_way: { pt: 'Estou indo até você', en: 'On my way to you' },
} as const

export type PingPreset = keyof typeof PING_PRESETS
