/** Continue after saving the profile; Signal readers can complete their household inside the protocol. */
export function onboardingDestination(redirectTo: string | null, members: number, inviteToken?: string | null): string {
  if (inviteToken) return `/sim/${encodeURIComponent(inviteToken)}`
  if (redirectTo?.startsWith('/sim/')) return redirectTo
  if (redirectTo && /^\/sinais\/[a-z0-9-]+$/.test(redirectTo)) return redirectTo
  return `/family?members=${members}`
}
