// ─── Typed, server-only hazard provider credentials ───────────────────────────
// No secret is ever read on the client. A provider is "configured" only when all
// its required secrets are present — otherwise it reports NOT_CONFIGURED and is
// never called. Never insert a placeholder/fake key here.

function present(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

export const hazardEnv = {
  weatherkit: {
    teamId: process.env.WEATHERKIT_TEAM_ID,
    serviceId: process.env.WEATHERKIT_SERVICE_ID,
    keyId: process.env.WEATHERKIT_KEY_ID,
    privateKey: process.env.WEATHERKIT_PRIVATE_KEY,
    get configured() {
      return present(this.teamId) && present(this.serviceId) && present(this.keyId) && present(this.privateKey)
    },
  },
  accuweather: {
    apiKey: process.env.ACCUWEATHER_API_KEY,
    get configured() {
      return present(this.apiKey)
    },
  },
  xweather: {
    clientId: process.env.XWEATHER_CLIENT_ID,
    clientSecret: process.env.XWEATHER_CLIENT_SECRET,
    get configured() {
      return present(this.clientId) && present(this.clientSecret)
    },
  },
  shakealert: {
    enabled: process.env.SHAKEALERT_ENABLED === 'true',
    endpoint: process.env.SHAKEALERT_ENDPOINT,
    token: process.env.SHAKEALERT_TOKEN,
    get configured() {
      return this.enabled && present(this.endpoint) && present(this.token)
    },
  },
  femaIpaws: {
    enabled: process.env.FEMA_IPAWS_ENABLED === 'true',
    cogId: process.env.FEMA_IPAWS_COG_ID,
    pin: process.env.FEMA_IPAWS_PIN,
    get configured() {
      return this.enabled && present(this.cogId) && present(this.pin)
    },
  },
} as const
