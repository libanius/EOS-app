/**
 * A pauta do FORTRESS, montada a partir do conteúdo do Marco 1.
 *
 * Serve de exemplo para os testes do contrato (CONTENT-001 §5.11) e de primeira
 * pauta da migração (§6, passo 2). O bloco `signal` vem de `lib/signals-content.ts`
 * sem os quatro campos que o EOS preenche; a lição é texto permanente, sem datas
 * de notícia (§5.6).
 */

import { SIGNALS } from '@/lib/signals-content'
import type { ContentPackage } from '@/lib/content-package'

export function fortressPackage(overrides: Partial<ContentPackage> = {}): ContentPackage {
  const fortress = SIGNALS.find(s => s.slug === 'fortress')
  if (!fortress) throw new Error('FORTRESS ausente de lib/signals-content.ts')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, status, publishedOn, reviewedByCurator, ...signal } = fortress
  return {
    schema: 'eos.content/1',
    slug,
    version: 1,
    status: 'review',
    signal,
    lesson: {
      title: {
        pt: 'Autonomia da casa: quantos dias a sua família aguenta sozinha',
        en: 'Home autonomy: how many days your family can hold on its own',
      },
      summary: {
        pt: 'Como medir a autonomia pela água e pela comida, e como subir em degraus de 72 horas, 2 semanas, 30 e 90 dias sem gastar de uma vez.',
        en: 'How to measure autonomy by water and food, and how to climb in steps of 72 hours, 2 weeks, 30 and 90 days without spending it all at once.',
      },
      body: {
        pt: [
          'A autonomia da casa é o número de dias que a família consegue ficar sem abastecimento de fora. Ela é sempre o menor entre a água e a comida, porque o recurso que acaba primeiro decide.',
          'Água: conte 1 galão, cerca de 3,8 litros, por pessoa por dia, para beber e para o mínimo de higiene. Comida: conte em dias-pessoa, três refeições por pessoa por dia, de alimentos que não precisam de geladeira.',
          'Suba em degraus. Primeiro 72 horas, depois 2 semanas, depois 30 dias, e só então 90. Cada degrau cobre o anterior. Comprar tudo de uma vez gasta dinheiro e espaço e faz a comida vencer.',
          'Junto com água e comida: kit de primeiros socorros, rádio a pilha, lanterna, pilhas, documentos em saco plástico e algum dinheiro em notas pequenas.',
        ].join('\n\n'),
        en: [
          'Home autonomy is the number of days your family can go without outside supplies. It is always the lower of water and food, because whatever runs out first decides.',
          'Water: count 1 gallon, about 3.8 liters, per person per day, for drinking and minimal hygiene. Food: count in person-days, three meals per person per day, of foods that do not need a fridge.',
          'Climb in steps. First 72 hours, then 2 weeks, then 30 days, and only then 90. Each step covers the one before. Buying everything at once costs money and space and lets food expire.',
          'Alongside water and food: a first-aid kit, a battery radio, a flashlight, batteries, documents in a plastic bag and some cash in small bills.',
        ].join('\n\n'),
      },
      scenarioTags: ['blackout', 'general', 'supplies'],
    },
    ...overrides,
  }
}
