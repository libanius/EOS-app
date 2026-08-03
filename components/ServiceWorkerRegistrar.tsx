'use client'

/**
 * Registra o service worker no App Router (D-075).
 *
 * O `next-pwa` está configurado com `register: true`, e isso é enganoso: essa
 * opção injeta o registro no `_app` do **Pages Router**. Neste app, que é App
 * Router inteiro, nada era injetado — e portanto **o service worker só existia
 * para quem abrisse `/settings`**, a única tela que registrava por conta própria
 * (para o push).
 *
 * Consequência prática, medida em navegador: `getRegistrations()` devolvia 0 em
 * `/dashboard`, `/plan`, `/preparedness` e em todo o resto. Não havia cache
 * offline nenhum — o app parecia ter PWA e não tinha.
 *
 * Isso importa mais do que parece: o Plano da Família (doc 18 §2) existe para
 * funcionar exatamente quando o EOS não funciona. Sem worker controlando a
 * página, um recarregamento sem rede não chega nem a executar nosso código.
 *
 * Fica no layout autenticado e não na raiz de propósito: quem ainda não entrou
 * não tem nada para usar offline, e registrar antes do login só adiantaria
 * trabalho de rede numa tela que precisa abrir rápido.
 */

import { useEffect } from 'react'

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // Espera a página assentar: o registro dispara o precache de ~100 arquivos,
    // e isso não pode competir com a primeira renderização.
    const register = () => {
      // `updateViaCache: 'none'` mantém o sw.js fora do cache HTTP do navegador —
      // a mesma trava de D-074, para que uma correção publicada não fique presa
      // atrás de um worker antigo.
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(registration => registration.update().catch(() => {}))
        .catch(() => {
          // Falhar aqui não pode derrubar a tela: sem service worker o app
          // continua funcionando, só perde o modo offline.
        })
    }

    if (document.readyState === 'complete') register()
    else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
