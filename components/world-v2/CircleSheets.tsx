'use client'

/**
 * As decisões saem da lista e vêm para cá (D-124).
 *
 * O cartão de cada membro carregava **doze controles**: papel, compartilhar
 * inventário, campos compartilhados, ficha médica, morar junto, remover,
 * telefone. Sete decisões diferentes empilhadas na mesma linha, em botões de
 * 18px de altura. Ninguém lê doze controles; a pessoa procura o que quer e
 * torce para não tocar no errado.
 *
 * A separação é simples e vale para as duas folhas daqui: **a lista mostra
 * estado, a folha guarda decisão**. Um toque na pessoa abre tudo o que se pode
 * decidir sobre ela, com alvos de tamanho de dedo e o motivo de cada opção ao
 * lado dela.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { haptic } from './motion'

export type SheetMember = {
  user_id: string
  name: string
  is_me: boolean
  role: string
  family_access_status: string
  household_status: string
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  shares_location: boolean
}

/**
 * Casca comum das duas folhas.
 *
 * Entra por baixo e sai por baixo — o caminho de volta é o mesmo da ida. O
 * `Escape` fecha, e o toque no escurecido fecha: uma tarefa modal nunca prende
 * ninguém.
 */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [onClose])

  return (
    <div className="cir-scrim" role="presentation" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cir-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" aria-hidden="true" />
        <div className="sheet-head">
          <strong className="t-title2">{label}</strong>
          <button type="button" className="cir-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="sheet-scroll">{children}</div>
      </div>
    </div>
  )
}

/** Uma decisão: o que é, por que importa, e os botões dela. */
function Decisao({ titulo, porque, children }: { titulo: string; porque: string; children: ReactNode }) {
  return (
    <section className="cir-decision">
      <strong className="t-sub">{titulo}</strong>
      <p className="t-foot ink-3">{porque}</p>
      <div className="acts">{children}</div>
    </section>
  )
}

export function MemberSheet({
  member,
  circleName,
  isAdmin,
  busy,
  pt,
  onClose,
  onRole,
  onHousehold,
  onFamilyAccess,
  onRespondFamilyAccess,
  onRemove,
}: {
  member: SheetMember
  circleName: string
  isAdmin: boolean
  busy: boolean
  pt: boolean
  onClose: () => void
  onRole: (role: string) => void
  onHousehold: (action: 'pedir' | 'confirmar' | 'sair') => void
  onFamilyAccess: (status: 'requested' | 'none') => void
  onRespondFamilyAccess: (action: 'accept' | 'deny' | 'leave') => void
  onRemove: () => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  const eu = member.is_me
  const act = (fn: () => void) => () => { haptic.impact(); fn() }

  return (
    <Sheet label={member.name} onClose={onClose}>
      <p className="t-foot ink-3 cir-sheet-sub">
        {circleName}{eu ? (pt ? ' · você' : ' · you') : ''} · {member.role}
      </p>

      {/* ── Mora na mesma casa ───────────────────────────────────────────── */}
      <Decisao
        titulo={pt ? '🏠 Mora nesta casa' : '🏠 Lives in this house'}
        porque={
          pt
            ? 'Entra na conta de água, comida e rota. Só a própria pessoa confirma — senão daria para contar a despensa de quem mora longe.'
            : 'Counts toward water, food and routes. Only the person themselves confirms — otherwise you could count a distant pantry.'
        }
      >
        {member.household_status === 'confirmed' ? (
          eu ? (
            <button className="cir-btn warn" disabled={busy} onClick={act(() => onHousehold('sair'))}>
              {pt ? 'Sair desta casa' : 'Leave this house'}
            </button>
          ) : (
            <span className="cir-state ok">{pt ? 'Mora aqui' : 'Lives here'}</span>
          )
        ) : member.household_status === 'requested' ? (
          eu ? (
            <>
              <button className="cir-btn primary" disabled={busy} onClick={act(() => onHousehold('confirmar'))}>
                {pt ? 'Sim, moro aqui' : 'Yes, I live here'}
              </button>
              <button className="cir-btn" disabled={busy} onClick={act(() => onHousehold('sair'))}>
                {pt ? 'Não moro' : "I don't"}
              </button>
            </>
          ) : (
            <span className="cir-state warn">{pt ? 'Só ela pode confirmar' : 'Only they can confirm'}</span>
          )
        ) : eu ? (
          <button className="cir-btn primary" disabled={busy} onClick={act(() => onHousehold('confirmar'))}>
            {pt ? 'Eu moro nesta casa' : 'I live in this house'}
          </button>
        ) : (
          <button className="cir-btn" disabled={busy} onClick={act(() => onHousehold('pedir'))}>
            {pt ? 'Perguntar se mora comigo' : 'Ask if they live with me'}
          </button>
        )}
      </Decisao>

      {/* ── Ficha médica ─────────────────────────────────────────────────── */}
      <Decisao
        titulo={pt ? '✚ Ficha médica' : '✚ Medical record'}
        porque={
          pt
            ? 'Consentimento SEPARADO do de morar junto. Morar na mesma casa não abre o prontuário de ninguém.'
            : 'A SEPARATE consent from living together. Sharing a house does not open anyone’s record.'
        }
      >
        {eu ? (
          member.family_access_status === 'approved' ? (
            <>
              <span className="cir-state ok">{pt ? 'Sua ficha está compartilhada' : 'Your record is shared'}</span>
              <button className="cir-btn warn" disabled={busy} onClick={act(() => onRespondFamilyAccess('leave'))}>
                {pt ? 'Parar de compartilhar' : 'Stop sharing'}
              </button>
            </>
          ) : member.family_access_status === 'requested' ? (
            <>
              <button className="cir-btn primary" disabled={busy} onClick={act(() => onRespondFamilyAccess('accept'))}>
                {pt ? 'Compartilhar minha ficha' : 'Share my record'}
              </button>
              <button className="cir-btn" disabled={busy} onClick={act(() => onRespondFamilyAccess('deny'))}>
                {pt ? 'Recusar' : 'Decline'}
              </button>
            </>
          ) : (
            <span className="cir-state">{pt ? 'Sua ficha, seu controle' : 'Your record, your control'}</span>
          )
        ) : member.family_access_status === 'approved' ? (
          <>
            <span className="cir-state ok">{pt ? 'Compartilhada com você' : 'Shared with you'}</span>
            {isAdmin && (
              <button className="cir-btn warn" disabled={busy} onClick={act(() => onFamilyAccess('none'))}>
                {pt ? 'Deixar de ver' : 'Stop viewing'}
              </button>
            )}
          </>
        ) : member.family_access_status === 'requested' ? (
          <span className="cir-state warn">{pt ? 'Aguardando a resposta dela' : 'Awaiting their answer'}</span>
        ) : isAdmin ? (
          <button className="cir-btn" disabled={busy} onClick={act(() => onFamilyAccess('requested'))}>
            {pt ? 'Pedir acesso à ficha' : 'Request record access'}
          </button>
        ) : (
          <span className="cir-state">{pt ? 'Não compartilhada' : 'Not shared'}</span>
        )}
      </Decisao>

      {/* ── Papel ────────────────────────────────────────────────────────── */}
      {isAdmin && !eu && (
        <Decisao
          titulo={pt ? 'Papel no círculo' : 'Role in the circle'}
          porque={
            pt
              ? 'Admin administra o círculo. Editor escreve planos. Viewer só lê.'
              : 'Admin manages the circle. Editor writes plans. Viewer reads only.'
          }
        >
          {['Admin', 'Editor', 'Viewer'].map(r => (
            <button
              key={r}
              className={`cir-btn${member.role === r ? ' on' : ''}`}
              disabled={busy}
              aria-pressed={member.role === r}
              onClick={act(() => onRole(r))}
            >
              {r}
            </button>
          ))}
        </Decisao>
      )}

      {/* ── Contato ──────────────────────────────────────────────────────── */}
      {member.emergency_contact_name && (
        <Decisao
          titulo={pt ? 'Contato de emergência' : 'Emergency contact'}
          porque={pt ? 'Quem ligar se não conseguir falar com ela.' : 'Who to call if you cannot reach them.'}
        >
          <a className="cir-btn" href={member.emergency_contact_phone ? `tel:${member.emergency_contact_phone}` : undefined}>
            📞 {member.emergency_contact_name}
          </a>
        </Decisao>
      )}

      {/* ── Remover ──────────────────────────────────────────────────────── */}
      {isAdmin && !eu && (
        <div className="cir-danger">
          {!confirmar ? (
            <button className="cir-btn danger" disabled={busy} onClick={() => setConfirmar(true)}>
              {pt ? `Remover ${member.name} do círculo` : `Remove ${member.name} from the circle`}
            </button>
          ) : (
            <>
              <p className="t-foot warn">
                {pt
                  ? 'Ela perde acesso ao círculo, ao plano e às mensagens. Pode voltar por convite.'
                  : 'They lose access to the circle, the plan and messages. They can return by invite.'}
              </p>
              <div className="acts">
                <button className="cir-btn danger" disabled={busy} onClick={act(onRemove)}>
                  {pt ? 'Sim, remover' : 'Yes, remove'}
                </button>
                <button className="cir-btn" disabled={busy} onClick={() => setConfirmar(false)}>
                  {pt ? 'Manter' : 'Keep'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

/**
 * Ajustes do círculo: o que é meu para decidir sobre o círculo inteiro.
 *
 * Ficava espalhado pelo cartão em caixas de seleção de 12px — abaixo de
 * qualquer alvo de toque razoável, e no meio da lista de gente.
 */
export function CircleSettingsSheet({
  circleName,
  isAdmin,
  shareInventory,
  sharedFields,
  busy,
  pt,
  onClose,
  onToggleShare,
  onToggleField,
  onRename,
  onDelete,
  onLeave,
  children,
}: {
  circleName: string
  isAdmin: boolean
  shareInventory: boolean
  sharedFields: string[]
  busy: boolean
  pt: boolean
  onClose: () => void
  onToggleShare: (next: boolean) => void
  onToggleField: (field: string, checked: boolean) => void
  onRename: () => void
  onDelete: () => void
  onLeave: () => void
  children?: ReactNode
}) {
  const campos: Array<[string, string, string]> = pt
    ? [
        ['location', 'Minha posição', 'Aparece no mapa do círculo e permite calcular rota até você.'],
        ['blood_type', 'Tipo sanguíneo', 'Aparece na sua ficha para quem tem acesso.'],
        ['allergies', 'Alergias', 'Aparece na sua ficha para quem tem acesso.'],
        ['medications', 'Medicamentos', 'Aparece na sua ficha para quem tem acesso.'],
        ['emergency_contact', 'Contato de emergência', 'Quem o círculo liga se não conseguir falar com você.'],
      ]
    : [
        ['location', 'My position', 'Appears on the circle map and enables routing to you.'],
        ['blood_type', 'Blood type', 'Appears in your record for those with access.'],
        ['allergies', 'Allergies', 'Appears in your record for those with access.'],
        ['medications', 'Medications', 'Appears in your record for those with access.'],
        ['emergency_contact', 'Emergency contact', 'Who the circle calls if they cannot reach you.'],
      ]

  return (
    <Sheet label={pt ? `Ajustes · ${circleName}` : `Settings · ${circleName}`} onClose={onClose}>
      <Decisao
        titulo={pt ? 'O que eu compartilho' : 'What I share'}
        porque={
          pt
            ? 'Cada item é uma escolha sua, e vale só neste círculo. Nada aqui é ligado por padrão.'
            : 'Each item is your choice, and applies to this circle only. Nothing here is on by default.'
        }
      >
        <span className="cir-sr">{circleName}</span>
      </Decisao>

      <label className="cir-switch">
        <span className="txt">
          <strong className="t-sub">{pt ? 'Meu inventário' : 'My inventory'}</strong>
          <span className="t-foot ink-3">
            {pt
              ? 'O círculo vê quanta água e comida você tem. Não soma na autonomia de ninguém — só quem mora junto soma.'
              : 'The circle sees how much water and food you have. It does not add to anyone’s autonomy — only housemates pool.'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={shareInventory}
          disabled={busy}
          onChange={e => { haptic.impact(); onToggleShare(e.target.checked) }}
        />
        <span className="track" aria-hidden="true"><i /></span>
      </label>

      {campos.map(([campo, rotulo, porque]) => {
        const ligado = sharedFields.includes(campo)
        return (
          <label key={campo} className="cir-switch">
            <span className="txt">
              <strong className="t-sub">{rotulo}</strong>
              <span className="t-foot ink-3">{porque}</span>
            </span>
            <input
              type="checkbox"
              checked={ligado}
              disabled={busy}
              onChange={e => { haptic.impact(); onToggleField(campo, e.target.checked) }}
            />
            <span className="track" aria-hidden="true"><i /></span>
          </label>
        )
      })}

      {children}

      <div className="cir-danger">
        {isAdmin && (
          <div className="acts">
            <button className="cir-btn" disabled={busy} onClick={onRename}>{pt ? 'Renomear círculo' : 'Rename circle'}</button>
            <button className="cir-btn danger" disabled={busy} onClick={onDelete}>{pt ? 'Excluir círculo' : 'Delete circle'}</button>
          </div>
        )}
        <button className="cir-btn warn" disabled={busy} onClick={onLeave}>{pt ? 'Sair do círculo' : 'Leave the circle'}</button>
      </div>
    </Sheet>
  )
}
