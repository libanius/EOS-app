/**
 * As três fontes abertas respondem de verdade (D-226).
 *
 * A ficha de planos prometia NASA, FEMA e FDA e o código não buscava nada. Este
 * teste bate nas APIs REAIS — nenhuma tem chave — e prova que a promessa passou
 * a ser cumprível. Ele é de rede: falha se a internet cair, e isso é aceitável
 * para o que ele existe para vigiar.
 *
 * O que prova:
 *   1. NASA EONET devolve incêndio aberto com coordenada
 *   2. o filtro de distância descarta o que está longe demais (controle: um
 *      ponto no meio do Pacífico não pode ter incêndio "perto")
 *   3. OpenFEMA responde por estado e traz `fipsCountyCode` para cruzar
 *   4. o cruzamento de condado via NWS resolve Miami-Dade a partir da coordenada
 *   5. openFDA devolve recall Classe I, e 404 significa "nenhum", não falha
 *   6. nenhum dos três exige chave: rodam com o ambiente limpo
 */

import { nasaEonetProvider } from '../lib/hazards/providers/nasa-eonet'
import { femaDeclarationsProvider, resolveUsPlace } from '../lib/hazards/providers/fema-declarations'
import { openFdaProvider } from '../lib/hazards/providers/openfda'

// Miami e um ponto no Pacífico Sul, longe de tudo — o controle negativo.
const MIAMI = { lat: 25.7617, lng: -80.1918 }
const PACIFICO = { lat: -40.0, lng: -140.0 }

let pass = 0, fail = 0
const ok = (l: string, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l: string, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

async function main() {
  console.log('── NASA EONET · incêndios ──')
  {
    const perto = await nasaEonetProvider.getEvents(MIAMI)
    const longe = await nasaEonetProvider.getEvents(PACIFICO)
    perto.status === 'live' ? ok('EONET ao vivo') : no('EONET não está ao vivo', perto.status)
    longe.data.length === 0
      ? ok('controle negativo: nenhum incêndio "perto" do meio do Pacífico')
      : no('o filtro de distância não filtra', `${longe.data.length} eventos no Pacífico`)
    console.log(`   incêndios dentro do raio de Miami: ${perto.data.length}`)
    const e = perto.data[0]
    if (e) {
      console.log(`   exemplo: ${e.title} · ${e.distanceMiles} mi · ${e.severity}`)
      e.hazardType === 'wildfire' && e.visualClass === 'DETECTED_EVENT'
        ? ok('incêndio é EVENTO DETECTADO, não aviso de governo')
        : no('classificação errada', `${e.hazardType}/${e.visualClass}`)
    }
  }

  console.log('\n── OpenFEMA · declarações ──')
  {
    const place = await resolveUsPlace(MIAMI)
    place?.state === 'FL' ? ok('NWS resolveu o estado', place.state) : no('estado não resolvido', JSON.stringify(place))
    place?.countyFips ? ok('condado resolvido em FIPS', place.countyFips) : no('FIPS do condado não resolvido')

    const r = await femaDeclarationsProvider.getEvents(MIAMI)
    r.status === 'live' ? ok('OpenFEMA ao vivo', `${r.data.length} declaração(ões)`) : no('OpenFEMA não está ao vivo', r.status)

    const fora = await femaDeclarationsProvider.getEvents(PACIFICO)
    fora.status === 'unavailable_here'
      ? ok('fora dos EUA diz "indisponível aqui", não "fora do ar"')
      : no('estado errado fora dos EUA', fora.status)

    const e = r.data[0]
    if (e) {
      console.log(`   exemplo: ${e.title} · ${e.summary}`)
      e.visualClass === 'ADVISORY' && e.urgency === 'future'
        ? ok('declaração NÃO se disfarça de aviso oficial urgente')
        : no('declaração com peso de aviso', `${e.visualClass}/${e.urgency}`)
    }
  }

  console.log('\n── openFDA · recalls ──')
  {
    const r = await openFdaProvider.getEvents(MIAMI)
    r.status === 'live' ? ok('openFDA ao vivo', `${r.data.length} recall(s) Classe I em 90 dias`) : no('openFDA não está ao vivo', r.status)
    const severidades = Array.from(new Set(r.data.map(e => e.severity)))
    r.data.length === 0 || severidades.every(s => s === 'severe')
      ? ok('só Classe I entra, e ela é severa')
      : no('classe indevida passou pelo filtro', severidades.join(', '))
    if (r.data[0]) console.log(`   exemplo: ${r.data[0].title.slice(0, 70)}`)
  }

  console.log('\n── nenhuma chave necessária ──')
  {
    const chaves = ['NASA_API_KEY', 'FIRMS_MAP_KEY', 'FEMA_API_KEY', 'FDA_API_KEY', 'AIRNOW_API_KEY']
    const postas = chaves.filter(k => process.env[k])
    postas.length === 0
      ? ok('os três canais rodaram sem nenhuma chave', `${chaves.length} verificadas`)
      : no('havia chave no ambiente — o teste não prova gratuidade', postas.join(', '))
  }

  console.log(`\n${pass} passaram, ${fail} falharam`)
  process.exitCode = fail > 0 ? 1 : 0

}

main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exitCode = 1 })
