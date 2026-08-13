/**
 * Amortecimento do laço (PREP-T09 / D-170).
 *
 * O teste que mais importa é o de acento e maiúscula: comparar por texto
 * exibido erraria **para mais**, reoferecendo o que já está na lista — e um app
 * que pede duas vezes o mesmo toque parece quebrado mesmo quando não está.
 */
import { alreadyOnList, dismissalKey, shouldShowReassessment } from '@/lib/proposal-dedup'
import { canonicalKey } from '@/lib/checklist'

const linha = (nome: string) => ({ canonical_key: canonicalKey(nome) })

describe('já está na lista', () => {
  it('reconhece o item exato', () => {
    expect(alreadyOnList('Comprar água', [linha('Comprar água')])).toBe(true)
  })

  it('reconhece apesar de acento, maiúscula e pontuação', () => {
    const lista = [linha('Comprar Água!')]
    expect(alreadyOnList('comprar agua', lista)).toBe(true)
    expect(alreadyOnList('COMPRAR ÁGUA', lista)).toBe(true)
  })

  it('não confunde itens diferentes', () => {
    expect(alreadyOnList('Comprar comida', [linha('Comprar água')])).toBe(false)
  })

  it('lista vazia é sempre falso', () => {
    expect(alreadyOnList('Comprar água', [])).toBe(false)
  })

  it('nome vazio não casa com nada', () => {
    // Uma chave vazia casaria com qualquer linha malformada.
    expect(alreadyOnList('', [{ canonical_key: '' }])).toBe(false)
  })

  it('usa a MESMA chave que o servidor grava', () => {
    // Se as duas divergirem, a tela reoferece para sempre o que o banco já tem.
    const nome = 'Comprar 9 gal de água — 3 dias para 3 pessoa(s)'
    expect(alreadyOnList(nome, [{ canonical_key: canonicalKey(nome) }])).toBe(true)
  })
})

describe('dispensa da reavaliação', () => {
  it('sem gatilho, nada aparece', () => {
    expect(shouldShowReassessment(null, [])).toBe(false)
  })

  it('gatilho novo aparece', () => {
    expect(shouldShowReassessment('nws|hurricane|critical|x', [])).toBe(true)
  })

  it('gatilho dispensado não volta', () => {
    const chave = 'nws|hurricane|critical|x'
    expect(shouldShowReassessment(chave, [dismissalKey(chave)])).toBe(false)
  })

  it('"já vi este aviso" NÃO significa "não me avise mais"', () => {
    /*
     * Outro evento, outra severidade ou outra validade produzem gatilho
     * diferente — e o aviso volta. Silenciar para sempre seria transformar uma
     * preferência de exibição num risco de segurança.
     */
    const visto = 'nws|hurricane|watch|expira-1'
    const novo = 'nws|hurricane|critical|expira-2'
    expect(shouldShowReassessment(novo, [dismissalKey(visto)])).toBe(true)
  })

  it('a chave de dispensa é estável', () => {
    expect(dismissalKey('abc')).toBe(dismissalKey('abc'))
    expect(dismissalKey('abc')).not.toBe(dismissalKey('abd'))
  })
})
