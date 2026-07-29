'use client'

/**
 * World v2 primitives.
 *
 * Every surface in v2 is built from these six pieces. If a screen needs a
 * seventh, it gets added here rather than styled inline — that is what keeps
 * the system readable as one system instead of a pile of one-off panels.
 *
 * Material rule: Card is the `regular` material, Tile is a flat fill INSIDE a
 * card. A translucent surface is never stacked on another translucent surface,
 * because legibility collapses when it is.
 */

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { haptic } from './motion'

export function Card({
  children,
  accented = false,
  className = '',
  ...rest
}: { children: ReactNode; accented?: boolean; className?: string } & ComponentProps<'div'>) {
  return (
    <div className={`wv2-card${accented ? ' accented' : ''} ${className}`.trim()} {...rest}>
      {children}
    </div>
  )
}

/** Section heading. Direct and specific — never a vague umbrella word. */
export function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="wv2-section-label">
      <span className="t-caps">{children}</span>
      {trailing ? <span className="t-foot ink-3">{trailing}</span> : null}
    </div>
  )
}

/** Primary/secondary action. Haptic fires on commit, not on press. */
export function Pill({
  children,
  primary = false,
  wide = false,
  onClick,
  ...rest
}: { children: ReactNode; primary?: boolean; wide?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`wv2-pill${primary ? ' primary' : ''}${wide ? ' wide' : ''}`}
      onClick={event => {
        haptic.impact()
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function PillLink({
  children,
  href,
  primary = false,
}: {
  children: ReactNode
  href: string
  primary?: boolean
}) {
  return (
    <Link href={href} className={`wv2-pill${primary ? ' primary' : ''}`} onClick={() => haptic.impact()}>
      {children}
    </Link>
  )
}

/**
 * `caption` renders a visible label under the glyph.
 *
 * `aria-label` and `title` cover screen readers and hover — but touch has no
 * hover, so on a phone an icon-only control is a guess. The rule from the design
 * foundations is blunt: if you need a label to explain a control, the mapping is
 * weak. Here the label is simply present.
 */
export function IconButton({
  children,
  label,
  caption,
  active = false,
  onClick,
  ...rest
}: {
  children: ReactNode
  label: string
  caption?: string
  active?: boolean
} & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`wv2-iconbtn${active ? ' on' : ''}${caption ? ' with-caption' : ''}`}
      aria-label={label}
      title={label}
      onClick={event => {
        haptic.impact()
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
      {caption && <span className="cap">{caption}</span>}
    </button>
  )
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="wv2-tilegrid">{children}</div>
}

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="wv2-tile">
      <span className="t-caps">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

/**
 * Reserve bar. `state` is spelled out in the value text as well as encoded in
 * the fill, so the reading never depends on colour alone.
 */
export function Bar({
  label,
  value,
  fraction,
  low = false,
}: {
  label: string
  value: string
  fraction: number
  low?: boolean
}) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100)
  return (
    <div className={`wv2-bar${low ? ' low' : ''}`}>
      <span className="t-sub ink-2">{label}</span>
      <span className="t-sub">{value}</span>
      <span className="track">
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
