/**
 * Interpret the text decoded from a scanned QR code.
 *
 * The app produces two kinds of QR:
 *   - Circle invite: the raw 6-char invite code (e.g. "ABC234"), see circles page.
 *   - Emergency card: a URL like https://host/ficha/<uuid>, see /ficha/[id].
 *
 * Kept pure so it can be unit-tested without a camera.
 */
export type ScanResult =
  | { type: 'invite-code'; code: string }
  | { type: 'ficha'; id: string }
  | { type: 'unknown'; raw: string }

const INVITE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function parseScannedValue(text: string): ScanResult {
  const raw = (text ?? '').trim()

  // Raw invite code
  const upper = raw.toUpperCase()
  if (INVITE_RE.test(upper)) return { type: 'invite-code', code: upper }

  // Ficha URL → extract the profile id after /ficha/
  const fichaMatch = raw.match(/\/ficha\/([^/?#]+)/i)
  if (fichaMatch) {
    const id = fichaMatch[1]
    if (UUID_RE.test(id)) return { type: 'ficha', id }
  }

  // A bare UUID (e.g. someone pasted just the id)
  if (UUID_RE.test(raw) && raw.length <= 40) return { type: 'ficha', id: raw }

  return { type: 'unknown', raw }
}
