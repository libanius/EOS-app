/**
 * Conteúdo dos Sinais publicados — Marco 1 (D-233).
 *
 * Versionado no código até o pipeline do dono existir (spec §12). Todo Sinal
 * daqui passa por `signalProblems()` no teste unitário: sem "o que não é" ou
 * sem fonte, o build não sai.
 *
 * FORTRESS foi ao ar sem a revisão do curador, por decisão do dono
 * (`reviewedByCurator: false`). Os fatos vêm só das fontes listadas.
 */

import type { ProtocolItem, Signal } from '@/lib/signals'

const ITEMS: ProtocolItem[] = [
  { resourceKey: 'agua', module: 'agua', kind: 'ENGINE_WATER', minDegree: 'D3',
    label: { pt: 'Água potável', en: 'Drinking water' },
    hint: { pt: '1 galão (3,8 L) por pessoa por dia', en: '1 gallon (3.8 L) per person per day' } },
  { resourceKey: 'filtro-agua', module: 'agua', kind: 'PRESENCE', minDegree: 'D14',
    label: { pt: 'Filtro ou purificador de água', en: 'Water filter or purifier' },
    hint: { pt: 'Para quando o estoque acabar', en: 'For when the stored water runs out' } },
  { resourceKey: 'reservatorio-agua', module: 'agua', kind: 'PRESENCE', minDegree: 'D30',
    label: { pt: 'Reservatório grande (barril ou galões)', en: 'Large water container (barrel or jugs)' } },

  { resourceKey: 'comida', module: 'comida', kind: 'ENGINE_FOOD', minDegree: 'D3',
    label: { pt: 'Comida não perecível', en: 'Non-perishable food' },
    hint: { pt: 'Que a família come de verdade e não precise de geladeira', en: 'Food your family actually eats, no fridge needed' } },
  { resourceKey: 'abridor-latas', module: 'comida', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Abridor de latas manual', en: 'Manual can opener' } },
  { resourceKey: 'fogareiro', module: 'comida', kind: 'PRESENCE', minDegree: 'D14',
    label: { pt: 'Fogareiro e combustível', en: 'Camp stove and fuel' },
    hint: { pt: 'Cozinhar sem energia elétrica, sempre ao ar livre', en: 'Cook without power, always outdoors' } },

  { resourceKey: 'kit-medico', module: 'saude', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Kit de primeiros socorros', en: 'First aid kit' } },
  { resourceKey: 'remedios-reserva', module: 'saude', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Reserva de remédios de uso contínuo', en: 'Reserve of daily medications' },
    hint: { pt: 'Converse com o médico sobre uma receita extra', en: 'Ask your doctor about an extra prescription' } },
  { resourceKey: 'higiene', module: 'saude', kind: 'PRESENCE', minDegree: 'D14',
    label: { pt: 'Higiene e saneamento', en: 'Hygiene and sanitation' },
    hint: { pt: 'Sacos resistentes, água sanitária, papel higiênico', en: 'Heavy-duty bags, bleach, toilet paper' } },

  { resourceKey: 'lanterna', module: 'energia', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Lanternas, uma por pessoa', en: 'Flashlights, one per person' } },
  { resourceKey: 'pilhas', module: 'energia', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Pilhas e baterias extras', en: 'Spare batteries' } },
  { resourceKey: 'power-bank', module: 'energia', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Power bank carregado', en: 'Charged power bank' } },
  { resourceKey: 'gerador-solar', module: 'energia', kind: 'PRESENCE', minDegree: 'D30',
    label: { pt: 'Gerador ou painel solar portátil', en: 'Generator or portable solar panel' } },

  { resourceKey: 'radio-comunicacao', module: 'comunicacao', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Rádio a pilha ou manivela (AM/FM/NOAA)', en: 'Battery or hand-crank radio (AM/FM/NOAA)' } },
  { resourceKey: 'plano-contato', module: 'comunicacao', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Plano de contato da família, em papel', en: 'Family contact plan, on paper' } },
  { resourceKey: 'radios-comunicadores', module: 'comunicacao', kind: 'PRESENCE', minDegree: 'D30',
    label: { pt: 'Rádios comunicadores (walkie-talkie)', en: 'Two-way radios (walkie-talkies)' } },

  { resourceKey: 'documentos', module: 'documentos', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Cópias de documentos em saco impermeável', en: 'Copies of documents in a waterproof bag' } },
  { resourceKey: 'dinheiro', module: 'documentos', kind: 'PRESENCE', minDegree: 'D3',
    label: { pt: 'Dinheiro em espécie, notas pequenas', en: 'Cash in small bills' },
    hint: { pt: 'Cartão e caixa eletrônico podem parar junto com a energia', en: 'Cards and ATMs can stop when the power does' } },

  { resourceKey: 'extintor', module: 'casa', kind: 'PRESENCE', minDegree: 'D14',
    label: { pt: 'Extintor de incêndio', en: 'Fire extinguisher' } },
]

export const SIGNALS: Signal[] = [
  {
    slug: 'fortress',
    status: 'published',
    level: 'PREPARAR',
    occurredOn: '2026-09-30',
    publishedOn: '2026-11-05',
    region: 'national',
    officialAlert: false,
    reviewedByCurator: false,
    title: {
      pt: 'FORTRESS: bases militares preparadas para 90 dias sozinhas',
      en: 'FORTRESS: military bases readied for 90 days on their own',
    },
    summary: {
      pt: 'O Pentágono quer que as grandes bases nos EUA funcionem 90 dias sem energia, água e combustível de fora. Não é aviso para civis, mas é uma boa hora para a sua casa medir a própria autonomia.',
      en: 'The Pentagon wants major U.S. bases to run 90 days without outside power, water and fuel. It is not a warning to civilians, but it is a good moment for your home to measure its own autonomy.',
    },
    whatItIs: {
      pt: 'Em 30 de setembro de 2026, o Secretário de Defesa Pete Hegseth anunciou o FORTRESS, uma iniciativa para que as instalações militares dos EUA continuem funcionando se o abastecimento de fora for cortado. Segundo reportagem da Fox News de 25 de outubro, o padrão em desenvolvimento pede que as grandes bases no território continental consigam operar por pelo menos 90 dias mantendo energia, combustível, água e comunicação, mesmo com a infraestrutura civil danificada. As medidas citadas incluem microrreatores, baterias de grande porte e microrredes que se desligam da rede civil.',
      en: 'On September 30, 2026, Defense Secretary Pete Hegseth announced FORTRESS, an initiative to keep U.S. military installations running if outside supplies are cut off. According to a Fox News report on October 25, the standard under development asks major bases in the continental U.S. to operate for at least 90 days with power, fuel, water and communications, even with civilian infrastructure damaged. Measures mentioned include microreactors, large battery storage and microgrids that can disconnect from the civilian grid.',
    },
    whatItIsNot: {
      pt: 'Não é um aviso de que um colapso vai acontecer, e não é uma ordem ou orientação para civis. O Pentágono não citou uma ameaça específica. É um padrão de planejamento para as bases, ainda em desenvolvimento: as autoridades ainda avaliam cerca de 500 bases, não há custo nem cronograma divulgados, e a implantação completa pode levar anos.',
      en: 'It is not a warning that a collapse is coming, and it is not an order or guidance for civilians. The Pentagon has not named a specific threat. It is a planning standard for bases, still in development: officials are still assessing about 500 bases, no cost or timeline has been released, and full implementation could take years.',
    },
    curatorNote: {
      pt: 'Comece pelas 72 horas e mire em 2 semanas. Os 90 dias são o padrão das bases, não o ponto de partida de uma família.',
      en: 'Start with 72 hours and aim for 2 weeks. Ninety days is the standard for bases, not the starting point for a family.',
    },
    sourceLine: {
      pt: 'Na mesma semana, o governo britânico lançou a campanha "Be Ready", que pede às famílias reservas para 3 dias sem serviços essenciais.',
      en: 'The same week, the British government launched its "Be Ready" campaign, asking households to prepare for 3 days without essential services.',
    },
    sources: [
      { title: 'Newsweek — What Is FORTRESS?', url: 'https://www.newsweek.com/what-is-fortress-pentagon-90-day-plan-12617804' },
      { title: 'Fortune — Pentagon orders bases to plan for 90 days without the grid', url: 'https://fortune.com/2026/10/26/pentagon-fortress-bases-90-days-off-grid-uk-be-ready-stockpile/' },
      { title: 'Fox News — Pentagon’s FORTRESS initiative', url: 'https://www.foxnews.com/politics/inside-pentagons-doomsday-plan-keep-america-fighting-global-war-erupts' },
      { title: 'AllSides — What we know about FORTRESS', url: 'https://www.allsides.com/news/2026-10-27-0700/defense-and-security-what-we-know-about-pentagons-fortress-initiative-keep-military-bases-running-grid' },
    ],
    protocol: {
      degrees: ['D3', 'D14', 'D30', 'D90'],
      recommendedDegree: 'D14',
      items: ITEMS,
    },
  },
]

export function publishedSignals(): Signal[] {
  return SIGNALS.filter(s => s.status === 'published')
}

export function signalBySlug(slug: string): Signal | undefined {
  return SIGNALS.find(s => s.slug === slug)
}
