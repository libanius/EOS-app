'use client'

import { useState } from 'react'
import Image from 'next/image'
import { optionUrlAllowed, type ProtocolOption } from '@/lib/signals'

type Props = {
  options: ProtocolOption[]
  lang: 'pt' | 'en'
  readOnly: boolean
  onHave: (option: ProtocolOption) => void
}

export default function ProtocolOptions({ options, lang, readOnly, onHave }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const pt = lang === 'pt'
  if (!options.length) return null
  return (
    <div className="sg-options">
      <h4>{pt ? 'Compare as opções' : 'Compare the options'}</h4>
      <p className="sg-note">{pt ? 'São alternativas para o mesmo item. Toque para conhecer e decidir.' : 'These are alternatives for the same item. Tap to learn and decide.'}</p>
      {options.map(option => {
        const expanded = open === option.id
        return (
          <div className="sg-option" key={option.id}>
            <button className="sg-option-toggle" type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : option.id)}>
              {optionUrlAllowed(option.imageUrl) && <Image src={option.imageUrl} alt={option.label[lang]} width={64} height={64} unoptimized className="sg-option-image" />}
              <span><strong>{option.label[lang]}</strong><span className="sg-note">{option.description[lang]}</span></span>
              <span aria-hidden="true">{expanded ? '−' : '+'}</span>
            </button>
            {expanded && (
              <div className="sg-option-details">
                <p><strong>{pt ? 'Vantagem: ' : 'Advantage: '}</strong>{option.advantage[lang]}</p>
                <p><strong>{pt ? 'Limitação: ' : 'Limitation: '}</strong>{option.limitation[lang]}</p>
                {option.notes && <p className="sg-note">{option.notes[lang]}</p>}
                {option.imageUrl && <span className="sg-note">{pt ? 'Imagem do fabricante.' : 'Manufacturer image.'}</span>}
                {optionUrlAllowed(option.sourceUrl) && <a href={option.sourceUrl} target="_blank" rel="noopener noreferrer">{pt ? 'Fonte e instruções' : 'Source and instructions'} ↗</a>}
                {optionUrlAllowed(option.purchaseUrl) && <a className="sg-btn block" href={option.purchaseUrl} target="_blank" rel="noopener noreferrer">{pt ? 'Ver onde comprar' : 'See where to buy'} ↗</a>}
                <button type="button" className="sg-btn block" disabled={readOnly} onClick={() => onHave(option)}>{pt ? 'Tenho este modelo' : 'I have this model'}</button>
                <span className="sg-note">{readOnly ? (pt ? 'Registro no estoque desativado nesta visualização.' : 'Stock registration is unavailable in this view.') : (pt ? 'Abre a ficha preenchida. Só altera o estoque quando você salvar.' : 'Opens a prefilled form. Stock only changes after you save.')}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
