import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { precisionLabel } from '../family-plan'

/**
 * PLAN-AUTHOR-001 / AUTHOR-T02 — confirmar um ponto que existe.
 *
 * A migração da EXEC-T01 marcou TODO waypoint legado como `precision: 'unknown'`
 * e o picker desabilitava `Confirmar` exatamente nesse estado. O acervo inteiro
 * de pontos do usuário caía no caminho que a própria tela indicava com
 * `Confirmar no mapa`, e o botão ficava cinza sem dizer por quê.
 */
describe('AUTHOR-T02 — precisão não bloqueia confirmação', () => {
  const source = readFileSync(join(process.cwd(), 'components/world-v2/PlanPage.tsx'), 'utf8')

  it('não desabilita Confirmar por precisão', () => {
    expect(source).toContain('disabled={!point || !target}')
    expect(source).not.toContain("disabled={!point || !target || precision === 'unknown'}")
  })

  it('declara o motivo quando Confirmar está desabilitado', () => {
    expect(source).toContain('confirmNeedsPoint')
    expect(source).toContain('aria-describedby')
  })

  /*
   * `gps` renderiza como "marcado no local". Um ponto solto no mapa do sofá não
   * foi marcado no local, e a carta do ponto de encontro não pode dizer que foi:
   * é a procedência falsa que a §5.2 do PLAN-EXEC-001 existe para impedir.
   */
  it('marcar no mapa grava address, nunca gps', () => {
    const onPick = source.slice(source.indexOf('onPick={picked =>'))
    const block = onPick.slice(0, onPick.indexOf('setOnMap(false)'))

    expect(block).toContain("setPrecision('address')")
    expect(block).not.toContain("setPrecision('gps')")
  })

  it('gps continua significando presença física, e address não', () => {
    expect(precisionLabel('gps', true)).toBe('marcado no local')
    expect(precisionLabel('address', true)).toBe('endereço buscado')
  })
})
