// Shim — @sentry/nextjs ships build/types/index.types.d.ts, but partial
// installs can omit those .d.ts files. This keeps tsc green until a full
// `npm install` populates build/types/*.
declare module '@sentry/nextjs'
