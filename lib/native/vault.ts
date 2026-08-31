/**
 * O cofre offline (D-228 §5).
 *
 * ── O problema que ele resolve ─────────────────────────────────────────────
 *
 * A casca carrega uma origem remota. Sem rede, um WebView mostra a página de
 * erro do sistema. Para um app de emergência isso é falha de produto: a hora em
 * que a família mais precisa do plano é exatamente a hora em que a torre caiu.
 *
 * `capacitor.config.ts` manda o WebView cair em `offline.html`, embutida no
 * binário. Mas essa página vive na origem LOCAL do app, e o EOS vive em
 * `https://…` — origens diferentes. O IndexedDB onde `saveFamilyPlan` guarda o
 * plano (doc 18 §6) é invisível de lá. `localStorage` também.
 *
 * O armazenamento nativo é do APLICATIVO, não da origem, e é a única ponte
 * entre os dois. Este módulo escreve nela; `native/www/offline.html` lê.
 *
 * ── Sobre o dado médico que passa por aqui ────────────────────────────────
 *
 * O cofre carrega tipo sanguíneo, alergias e medicamentos. Isso é dado de saúde
 * (docs/38 §1.2) e merece ser dito em voz alta — mas é o MESMO conteúdo que a
 * ficha já publica em `/ficha/[id]`, aberta a socorrista sem login por decisão
 * de produto. O cofre não amplia o alcance; ele garante que, sem rede, quem
 * está com o telefone na mão veja o que a ficha existiria para mostrar.
 *
 * No Android o manifesto declara `allowBackup="false"`, então isto não sai do
 * aparelho pelo backup automático. No iOS o `UserDefaults` entra no backup do
 * iCloud — anotado em `docs/39-native-shell.md` §6 como ponto de decisão do
 * dono, não resolvido em silêncio aqui.
 */

import type { PlanDocument } from '@/lib/family-plan'
import { nativeGet, nativeRemove, nativeSet } from '@/lib/native/bridge'

/** Precisa ser idêntica à constante em `native/www/offline.html`. */
export const VAULT_KEY = 'eos.offline.vault.v1'

export type VaultFicha = {
  name?: string
  bloodType?: string
  allergies?: string
  medications?: string
  medicalNotes?: string
  emergencyContact?: string
}

export type VaultPlan = {
  title?: string
  version?: number
  steps: string[]
}

export type OfflineVault = {
  savedAt: string
  lang: 'pt' | 'en'
  ficha?: VaultFicha
  plan?: VaultPlan
}

/** A ficha como sai de `GET /api/profile/ficha` — colunas de `profiles`. */
export type FichaRow = {
  name?: string | null
  blood_type?: string | null
  allergies?: string[] | string | null
  medications?: string[] | string | null
  medical_notes?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}

function texto(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t : undefined
}

function lista(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    const itens = v.map(texto).filter((x): x is string => !!x)
    return itens.length ? itens.join(', ') : undefined
  }
  return texto(v)
}

const RENDEZVOUS: Record<string, { pt: string; en: string }> = {
  rendezvous_1: { pt: 'Ponto de encontro 1', en: 'Meeting point 1' },
  rendezvous_2: { pt: 'Ponto de encontro 2', en: 'Meeting point 2' },
  rendezvous_3: { pt: 'Ponto de encontro 3', en: 'Meeting point 3' },
  home: { pt: 'Casa', en: 'Home' },
  school: { pt: 'Escola', en: 'School' },
  work: { pt: 'Trabalho', en: 'Work' },
  custom: { pt: 'Ponto', en: 'Point' },
}

export function fichaParaCofre(row: FichaRow | null | undefined): VaultFicha | undefined {
  if (!row) return undefined
  const contatoNome = texto(row.emergency_contact_name)
  const contatoTel = texto(row.emergency_contact_phone)
  const ficha: VaultFicha = {
    name: texto(row.name),
    bloodType: texto(row.blood_type),
    allergies: lista(row.allergies),
    medications: lista(row.medications),
    medicalNotes: texto(row.medical_notes),
    emergencyContact: [contatoNome, contatoTel].filter(Boolean).join(' · ') || undefined,
  }
  return Object.values(ficha).some(Boolean) ? ficha : undefined
}

/**
 * O plano vira uma lista de passos legíveis.
 *
 * A tela de fallback não desenha mapa, não tem rota e não tem sessão. O que
 * sobra de um plano sem nada disso são as duas coisas que a pessoa precisa
 * LEMBRAR: para onde ir, e o que dispara o quê. Waypoints viram destino;
 * gatilhos viram "se … então …". Papéis ficam de fora porque referenciam
 * `member_user_id` — sem rede não há como transformar um id em um nome, e um
 * passo dizendo "a3f2-… leva o rádio" é pior que passo nenhum.
 */
export function planoParaCofre(
  doc: PlanDocument | null | undefined,
  lang: 'pt' | 'en',
): VaultPlan | undefined {
  if (!doc) return undefined
  const passos: string[] = []

  const waypoints = [...(doc.waypoints ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )
  for (const w of waypoints) {
    const rotulo = (RENDEZVOUS[w.kind] ?? RENDEZVOUS.custom)[lang]
    const nome = texto(w.name)
    if (!nome) continue
    const notas = texto(w.notes)
    passos.push(notas ? `${rotulo}: ${nome} — ${notas}` : `${rotulo}: ${nome}`)
  }

  const gatilhos = [...(doc.triggers ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )
  for (const g of gatilhos) {
    const cond = texto(g.condition)
    const acao = texto(g.action)
    if (!cond || !acao) continue
    passos.push(lang === 'en' ? `If ${cond} → ${acao}` : `Se ${cond} → ${acao}`)
  }

  if (!passos.length) return undefined
  return { title: texto(doc.plan?.name), version: doc.plan?.version, steps: passos }
}

/**
 * Monta o cofre. Função pura — a escrita é `salvarCofre`.
 *
 * Devolve `null` quando não há nada que valha a pena guardar. Isso importa:
 * gravar um cofre vazio por cima de um cheio apagaria a ficha que a pessoa tem
 * offline no momento em que uma chamada de rede falhou. Ver `salvarCofre`.
 */
export function montarCofre(input: {
  ficha?: FichaRow | null
  plan?: PlanDocument | null
  lang?: string | null
  now?: Date
}): OfflineVault | null {
  const lang = input.lang === 'en' ? 'en' : 'pt'
  const ficha = fichaParaCofre(input.ficha)
  const plan = planoParaCofre(input.plan, lang)
  if (!ficha && !plan) return null
  return {
    savedAt: (input.now ?? new Date()).toISOString(),
    lang,
    ...(ficha ? { ficha } : {}),
    ...(plan ? { plan } : {}),
  }
}

/** Lê o cofre gravado. `null` quando não há casca, valor ou JSON válido. */
export async function lerCofre(scope?: unknown): Promise<OfflineVault | null> {
  const bruto = await nativeGet(VAULT_KEY, scope)
  if (!bruto) return null
  try {
    return JSON.parse(bruto) as OfflineVault
  } catch {
    return null
  }
}

/**
 * Espelha o cofre no armazenamento nativo, MESCLANDO com o que já está lá.
 *
 * ── Por que mesclar, e não substituir ─────────────────────────────────────
 *
 * A ficha e o plano são carregados por telas diferentes: `/ficha` e a tela do
 * plano. Se cada uma escrevesse o cofre inteiro, visitar a ficha apagaria o
 * plano do cofre e visitar o plano apagaria a ficha — e a tela offline mostraria
 * sempre a última que a pessoa abriu, nunca as duas.
 *
 * Só a seção presente na chamada é trocada. As demais permanecem.
 *
 * No navegador não faz nada e devolve `false` — não é erro, é o caso normal.
 * Cofre vazio NÃO apaga o que já existe: se a chamada que alimenta esta função
 * falhou por rede, o certo é manter o último cofre bom, que é exatamente o que
 * a pessoa vai precisar em seguida.
 */
export async function salvarCofre(
  input: Parameters<typeof montarCofre>[0],
  scope?: unknown,
): Promise<boolean> {
  const parcial = montarCofre(input)
  if (!parcial) return false

  const anterior = await lerCofre(scope)
  const combinado: OfflineVault = {
    savedAt: parcial.savedAt,
    lang: parcial.lang,
    ...(parcial.ficha ?? anterior?.ficha ? { ficha: parcial.ficha ?? anterior?.ficha } : {}),
    ...(parcial.plan ?? anterior?.plan ? { plan: parcial.plan ?? anterior?.plan } : {}),
  }
  return nativeSet(VAULT_KEY, JSON.stringify(combinado), scope)
}

/**
 * Apaga o cofre. Chamado na saída da conta e na exclusão (D-175).
 *
 * Sem isto, sair da conta deixaria a ficha médica da família anterior legível na
 * tela offline do aparelho — para quem quer que abrisse o app depois.
 */
export async function limparCofre(scope?: unknown): Promise<boolean> {
  return nativeRemove(VAULT_KEY, scope)
}
