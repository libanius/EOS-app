# EOS — Emergency Operating System

A survival intelligence platform that guides families through emergencies with clarity, precision, and adaptability — even when infrastructure fails.

## Stack
- **Framework**: Next.js 14 App Router
- **Language**: TypeScript (strict)
- **Database**: Supabase (Postgres + Auth + pgvector)
- **AI**: Claude API (claude-sonnet-4-20250514)
- **Deploy**: Vercel

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format
npm run format:check # Prettier check
npm run type-check   # TypeScript check
```

## Environment Variables

```bash
cp .env.example .env.local
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
