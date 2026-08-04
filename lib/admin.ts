/**
 * App-owner allowlist (D-061). Only these emails may create gift codes / access
 * admin surfaces. Configurable via ADMIN_EMAILS (comma-separated); defaults to
 * the app owner. Server-only — never gate solely on the client.
 */
const DEFAULT_ADMINS = ['eosoffgrid@gmail.com', 'paulolibanionetousa@gmail.com']

export function adminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS
  const list = (env ? env.split(',') : DEFAULT_ADMINS)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  return list.length ? list : DEFAULT_ADMINS
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().includes(email.trim().toLowerCase())
}
