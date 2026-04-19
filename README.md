# Yulis

Recruiting workspace (React + TypeScript + Vite + Supabase).

## Send email (compose button)

The floating **New message** button opens the compose window. Sending goes to **`POST /api/email/send`** (authenticated with your Supabase session). That function forwards JSON to **[Make.com](https://www.make.com)** via **`MAKE_EMAIL_WEBHOOK_URL`** — the same automation account you can use from Cursor MCP (“Yuli's Make Account”). The browser cannot call MCP directly; the webhook connects your Make scenario to the app.

### Make.com (one-time)

1. In Make, create a scenario: trigger **Webhooks → Custom webhook** (copy the webhook URL).
2. Add modules to send mail (e.g. **Gmail**, **Microsoft 365**, or **Email**) and map fields from the webhook payload: `to`, `cc`, `bcc`, `subject`, `bodyText`, `bodyHtml`, plus `initiatedByUserId` and `source` (`yulis`).
3. Optionally set **`MAKE_EMAIL_WEBHOOK_SECRET`** in Vercel and add a filter in Make so only requests with header **`X-Email-Webhook-Secret`** matching your secret are accepted.

### Environment variables (Vercel + local)

Set these in the Vercel project (**Settings → Environment Variables**) for Production and Preview:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Same value as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same value as `VITE_SUPABASE_ANON_KEY` (`/api/email/send` verifies the user JWT) |
| `MAKE_EMAIL_WEBHOOK_URL` | Full URL of your Make **Custom webhook** trigger |
| `MAKE_EMAIL_WEBHOOK_SECRET` | Optional; sent as header `X-Email-Webhook-Secret` if set |

**Important:** `VITE_SUPABASE_*` is **only for the browser bundle**. Functions under `/api/*` **do not** see `VITE_*`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for serverless explicitly.

Copy from [.env.example](.env.example) into `.env` for local runs.

### Local API + compose

Server routes live under `/api/*` (Vercel Functions).

**Recommended (Vite + `/api` in one step):**

```bash
npm run dev:stack
```

This starts `vercel dev` on **port 3000**, waits until that port accepts connections, then starts Vite on **port 5173**. Open **`http://localhost:5173`** — Vite proxies `/api/*` to `http://localhost:3000` (override with `DEV_API_PROXY_TARGET` in `.env` if needed).

**One URL:** run `npm run dev:vercel` (or `vercel dev`) and use the URL it prints (often `http://localhost:3000`) — SPA and `/api/*` share that origin.

**Two terminals:** start `vercel dev --listen 3000`, then `npm run dev`, open Vite’s URL.

If **`502`** appears on `/api/*` while using Vite on :5173, nothing is answering the proxy — start `vercel dev` on that port or use `npm run dev:stack`.

Plain **`npm run dev`** only proxies `/api` when a backend is already listening on `DEV_API_PROXY_TARGET`.

---

## Scripts

- `npm run dev` — Vite only (proxies `/api` to `DEV_API_PROXY_TARGET`; needs `vercel dev` on that port for `/api/email/send`)
- `npm run dev:stack` — `vercel dev` on :3000, then Vite on :5173 (recommended for compose + HMR locally)
- `npm run dev:vercel` — `vercel dev` only (single URL, often `http://localhost:3000`)
- `npm run build` — typecheck + production bundle
- `npm run lint` — ESLint
- `npm run test` — Vitest (unit tests under `src/**/*.test.ts`)
- `npm run db:migrate` — applies **all** `supabase/migrations/*.sql` in sorted order (requires `DATABASE_URL` in `.env`)

See [docs/performance-inspection/](docs/performance-inspection/) for the prioritized performance / scale backlog.

---

Below is upstream Vite template reference (kept for ESLint / tooling notes).

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
