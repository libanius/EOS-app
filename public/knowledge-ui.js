/* Local library UI, shared byte-for-byte by native fallback and public/offline.html. */
(function () {
  'use strict'
  var engine = globalThis.EOSKnowledge
  var pack = null
  var lang = navigator.language.toLowerCase().indexOf('pt') === 0 ? 'pt' : 'en'
  var select = document.getElementById('knowledge-language')
  var field = document.getElementById('knowledge-query')
  var results = document.getElementById('knowledge-results')
  var status = document.getElementById('knowledge-status')
  var copy = {
    pt: { title: 'Biblioteca offline', search: 'Consultar no aparelho', label: 'Qual assunto você precisa consultar?',
      placeholder: 'Água, fogo, abrigo, comida, medo…', empty: 'Biblioteca ainda não salva neste aparelho. Abra o EOS com conexão para baixar o acervo.',
      saved: 'textos salvos em', version: 'versão', note: 'Consulta documental, sem IA generativa. Manuais no idioma original. Notícias são registros históricos; não confirmam condições atuais. Vídeos e links externos precisam de conexão.',
      none: 'Nenhum trecho correspondente. Tente outra palavra ou procure na lista abaixo.', full: 'Ler texto completo salvo', source: 'Fonte', manual: 'Manual', signal: 'Sinal', edu: 'EDU', all: 'Todas as fontes salvas', excerpt: 'Trecho encontrado' },
    en: { title: 'Offline library', search: 'Search on this device', label: 'What topic do you need?',
      placeholder: 'Water, fire, shelter, food, fear…', empty: 'Library not saved on this device yet. Open EOS with a connection to download it.',
      saved: 'texts saved on', version: 'version', note: 'Document lookup, without generative AI. Manuals remain in their original language. News is historical and does not confirm current conditions. Videos and external links need a connection.',
      none: 'No matching passage. Try another word or browse the list below.', full: 'Read full saved text', source: 'Source', manual: 'Manual', signal: 'Signal', edu: 'EDU', all: 'All saved sources', excerpt: 'Matching excerpt' }
  }
  function text(id, value) { document.getElementById(id).textContent = value }
  function element(tag, value) { var el = document.createElement(tag); if (value) el.textContent = value; return el }
  function fullText(document) {
    if (document.kind !== 'manual') return document.text
    return pack.documents.filter(function (d) { return d.kind === 'manual' && d.source === document.source })
      .sort(function (a, b) { return a.title.localeCompare(b.title, undefined, { numeric: true }) })
      .map(function (d) { return d.text }).join('\n\n———\n\n')
  }
  function article(doc, excerpt) {
    var t = copy[lang]
    var node = element('article')
    node.appendChild(element('h3', t[doc.kind] + ': ' + doc.title))
    node.appendChild(element('p', t.source + ': ' + doc.source + ' · ' + t.version + ' ' + doc.version + ' · ' + doc.lang.toUpperCase()))
    if (excerpt) {
      node.appendChild(element('strong', t.excerpt))
      var p = element('p', excerpt); p.className = 'knowledge-text'; node.appendChild(p)
    }
    var details = element('details')
    details.appendChild(element('summary', t.full))
    // Render large manuals only when opened; no network or raw HTML interpretation.
    details.addEventListener('toggle', function () {
      if (details.open && details.children.length === 1) {
        var body = element('p', fullText(doc)); body.className = 'knowledge-text'; details.appendChild(body)
      }
    })
    node.appendChild(details)
    return node
  }
  function render() {
    var t = copy[lang]
    select.value = lang
    text('knowledge-title', t.title); text('knowledge-search', t.search); text('knowledge-label', t.label)
    text('knowledge-note', t.note); field.placeholder = t.placeholder
    status.textContent = pack ? pack.documents.length + ' ' + t.saved + ' ' + new Date(pack.syncedAt).toLocaleString() + ' · ' + pack.version.slice(0, 12) : t.empty
    results.replaceChildren()
    if (!pack) return
    var question = field.value.trim()
    if (question) {
      var hits = engine.searchKnowledge(pack, question, lang)
      if (!hits.length) results.appendChild(element('p', t.none))
      hits.forEach(function (hit) { results.appendChild(article(hit.document, hit.excerpt)) })
    }
    var list = element('details')
    list.appendChild(element('summary', t.all))
    var seen = new Set()
    pack.documents.filter(function (d) { return d.kind === 'manual' || d.lang === lang }).forEach(function (d) {
      var key = d.kind === 'manual' ? d.source : d.id
      if (seen.has(key)) return
      seen.add(key); list.appendChild(article(d))
    })
    results.appendChild(list)
  }
  async function digest(documents) {
    var hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(documents)))
    return Array.from(new Uint8Array(hash), function (b) { return b.toString(16).padStart(2, '0') }).join('')
  }
  async function nativeRead(prefs) {
    var r = await prefs.get({ key: engine.KNOWLEDGE_KEY })
    if (!r.value) return null
    var manifest = JSON.parse(r.value)
    for (var m of [manifest, manifest.previous]) {
      if (!m || !/^[a-f0-9]{64}$/.test(m.version) || !Number.isInteger(m.blocks) || m.blocks < 1 || m.blocks > 300) continue
      try {
        var blocks = []
        for (var i = 0; i < m.blocks; i++) {
          var block = await prefs.get({ key: engine.KNOWLEDGE_KEY + ':' + m.version + ':' + i })
          if (block.value === null) throw new Error('missing block')
          blocks.push(block.value)
        }
        var candidate = JSON.parse(blocks.join(''))
        if (engine.validKnowledgePack(candidate) && await digest(candidate.documents) === candidate.version) return candidate
      } catch (_) { /* The previous complete generation is the fallback. */ }
    }
    return null
  }
  function webRead() {
    return new Promise(function (resolve) {
      var request = indexedDB.open('eos', 1)
      request.onupgradeneeded = function () { request.transaction.abort(); resolve(null) }
      request.onerror = function () { resolve(null) }
      request.onsuccess = function () {
        var db = request.result
        if (!db.objectStoreNames.contains('kv')) { db.close(); resolve(null); return }
        var tx = db.transaction('kv', 'readonly')
        var get = tx.objectStore('kv').get('knowledge:pack')
        get.onsuccess = function () { resolve(get.result || null) }
        get.onerror = function () { resolve(null) }
        tx.oncomplete = function () { db.close() }
      }
    })
  }
  var history = []
  var chatBusy = false
  var preparing = false
  var localStatus = null
  var messages = document.getElementById('local-messages')
  var localQuestion = document.getElementById('local-question')
  var prepareButton = document.getElementById('local-prepare')
  var stopButton = document.getElementById('local-stop')
  var removeButton = document.getElementById('local-remove')
  function runtime() { return globalThis.EOSLocalAI }
  function paintLocal() {
    var pt = lang === 'pt'
    text('local-title', pt ? 'Pilot · conversa offline' : 'Pilot · offline conversation')
    text('local-label', pt ? 'Converse usando a biblioteca salva' : 'Converse using the saved library')
    text('local-send', pt ? 'Enviar' : 'Send'); text('local-clear', pt ? 'Limpar conversa' : 'Clear conversation')
    text('local-prepare', pt ? 'Preparar conversa offline' : 'Prepare offline conversation')
    text('local-stop', pt ? 'Interromper IA local' : 'Stop local AI')
    text('local-remove', pt ? 'Remover modelo baixado' : 'Remove downloaded model')
    text('local-download', localStatus && localStatus.state === 'needs_download'
      ? (pt ? 'Download opcional de aproximadamente 1 GB. Prefira Wi-Fi; prepare antes de ficar sem rede.' : 'Optional download of about 1 GB. Prefer Wi-Fi; prepare before losing connection.') : '')
    prepareButton.hidden = preparing || chatBusy || !localStatus || ['unsupported', 'ready'].includes(localStatus.state)
    stopButton.hidden = !preparing && !chatBusy && (!localStatus || localStatus.state !== 'ready')
    removeButton.hidden = preparing || chatBusy || !localStatus || localStatus.provider !== 'webllm' || !['ready', 'cached'].includes(localStatus.state)
    localQuestion.disabled = chatBusy
    document.getElementById('local-send').disabled = chatBusy
  }
  async function updateLocalStatus() {
    try {
      localStatus = runtime() ? await runtime().status() : null
      var state = localStatus && localStatus.state
      text('local-status', state === 'ready' ? (lang === 'pt' ? 'IA local pronta nesta sessão' : 'Local AI ready in this session')
        : state === 'unsupported' ? (lang === 'pt' ? 'IA local indisponível aqui. A consulta documental continua disponível.' : 'Local AI unavailable here. Document lookup remains available.')
        : (lang === 'pt' ? 'Prepare ou carregue o modelo para conversar sem rede.' : 'Prepare or load the model to converse without network.'))
    } catch (_) { text('local-status', lang === 'pt' ? 'Modelo indisponível. Use a biblioteca salva.' : 'Model unavailable. Use the saved library.') }
    paintLocal()
  }
  prepareButton.addEventListener('click', async function () {
    preparing = true; paintLocal()
    try {
      await runtime().prepare(function (progress) { text('local-status', (lang === 'pt' ? 'Preparando IA local' : 'Preparing local AI') + ' · ' + Math.round(progress * 100) + '%') })
      await updateLocalStatus()
    } catch (_) { text('local-status', lang === 'pt' ? 'Preparação não concluída. A biblioteca foi preservada.' : 'Preparation did not finish. The library was preserved.') }
    finally { preparing = false; paintLocal() }
  })
  stopButton.addEventListener('click', async function () {
    if (runtime()) await runtime().cancel()
    preparing = false; await updateLocalStatus()
  })
  removeButton.addEventListener('click', async function () {
    if (runtime()) await runtime().remove()
    await updateLocalStatus()
  })
  document.getElementById('local-clear').addEventListener('click', async function () {
    if (runtime()) await runtime().cancel()
    history = []; messages.replaceChildren(); await updateLocalStatus()
  })
  document.getElementById('local-form').addEventListener('submit', async function (event) {
    event.preventDefault()
    var question = localQuestion.value.trim()
    if (!question || chatBusy) return
    chatBusy = true; localQuestion.value = ''; paintLocal()
    messages.appendChild(element('p', question))
    text('local-status', lang === 'pt' ? 'Consultando no aparelho…' : 'Consulting on this device…')
    try {
      var result = runtime() ? await runtime().answer({ question: question, pt: lang === 'pt', history: history, pack: pack })
        : { mode: 'documents', text: engine.offlineKnowledgeReply(pack, question, lang === 'pt').text, sources: [] }
      var body = element('p', result.text); body.className = 'knowledge-text'; messages.appendChild(body)
      result.sources.forEach(function (source) {
        var details = element('details')
        details.appendChild(element('summary', source.title + ' · ' + source.version))
        var reference = element('p', source.text); reference.className = 'knowledge-text'; details.appendChild(reference)
        messages.appendChild(details)
      })
      if (result.mode === 'local_ai') messages.appendChild(element('p', (lang === 'pt' ? 'IA local · cópia salva em ' : 'Local AI · copy saved on ') + result.syncedAt))
      history.push({ role: 'user', content: question }, { role: 'assistant', content: result.text })
      history = history.slice(-6)
    } catch (_) { messages.appendChild(element('p', lang === 'pt' ? 'Conversa interrompida. A biblioteca continua disponível.' : 'Conversation interrupted. The library remains available.')) }
    finally { chatBusy = false; await updateLocalStatus(); paintLocal() }
  })
  void updateLocalStatus()
  async function load() {
    try {
      var cap = window.Capacitor
      var prefs = cap && cap.Plugins && cap.Plugins.Preferences
      var candidate = prefs ? await nativeRead(prefs) : await webRead()
      pack = engine.validKnowledgePack(candidate) && await digest(candidate.documents) === candidate.version ? candidate : null
    } catch (_) { pack = null }
    render()
  }
  select.addEventListener('change', function () { lang = select.value === 'pt' ? 'pt' : 'en'; render(); void updateLocalStatus() })
  document.getElementById('knowledge-form').addEventListener('submit', function (event) { event.preventDefault(); render() })
  if (window.Capacitor) void load()
  else { void load(); document.addEventListener('deviceready', load, { once: true }) }
})()
