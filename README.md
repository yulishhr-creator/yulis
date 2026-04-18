# Yulis

Recruiting workspace (React + TypeScript + Vite + Supabase).

## Gmail integration (compose)

The app can send email **through your Gmail account** using OAuth and the Gmail API. Configure this once in **Settings → Gmail**.

### Google Cloud Console (one-time)

1. Create a project (or pick an existing one) in [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → OAuth consent screen**: choose **External** (or Internal if Workspace-only). For personal testing, set publishing status to **Testing** and add your Gmail address under **Test users** (required for restricted scopes until the app is verified).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → **Web application**.
4. Under **Authorized redirect URIs**, add:
   - `https://yulis.vercel.app/api/gmail/oauth/callback` (production)
   - `http://localhost:3000/api/gmail/oauth/callback` (local — use `vercel dev`, see below)
5. Enable **Gmail API** for the project (**APIs & Services → Library** → search “Gmail API” → Enable).

Scopes used: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.send`.

### Environment variables (Vercel + local)

Set these in the Vercel project (**Settings → Environment Variables**) for Production and Preview:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Must match Google Console exactly, e.g. `https://yulis.vercel.app/api/gmail/oauth/callback` |
| `SUPABASE_URL` | Same value as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same value as `VITE_SUPABASE_ANON_KEY` (API validates user JWTs) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — never expose to the browser |
| `OAUTH_STATE_SECRET` | Long random secret (e.g. 32+ bytes hex) used to sign OAuth `state` |
| `APP_ORIGIN` | Recommended: `https://yulis.vercel.app` so OAuth return URL is stable (preview deploys use a different `VERCEL_URL`) |

**Important:** `VITE_SUPABASE_*` is **only for the browser bundle**. Serverless functions under `/api/*` **do not** see `VITE_*` variables. You must set `SUPABASE_URL` and `SUPABASE_ANON_KEY` explicitly (same values as in the Vite vars). If `/api/gmail/status` or Connect fails with a message about a missing env name, add that variable in Vercel and **redeploy**.

From the Google **Download JSON** (OAuth client): use `client_id` → `GOOGLE_CLIENT_ID` and `client_secret` → `GOOGLE_CLIENT_SECRET`.

Copy from [.env.example](.env.example) into `.env` for local runs.

### Database migration for Gmail tokens

Apply [`supabase/migrations/033_gmail_integration.sql`](supabase/migrations/033_gmail_integration.sql) to your hosted Supabase database (Dashboard → SQL → paste file, or `psql "$DATABASE_URL" -f ...`).

### Local API + Gmail

Server routes live under `/api/*` (Vercel Functions).

**Option A — one process:** run `vercel dev` and open the URL it prints (often `http://localhost:3000`). The SPA and `/api/gmail/*` run together.

**Option B — two processes (Vite HMR + APIs):** in one terminal run `vercel dev --listen 3000`, in another run `npm run dev` and open **Vite’s** URL (e.g. `http://localhost:5173`). Vite proxies `/api/*` to `http://127.0.0.1:3000` by default; override with `DEV_API_PROXY_TARGET` in `.env` if your `vercel dev` port differs.

Without a reachable `vercel dev` on that port, Gmail API calls from the Vite app will fail to connect — plain `npm run dev` no longer mis-serves `api/*.ts` as JavaScript, but it does not implement the functions itself.

---

## Scripts

- `npm run dev` — local dev server
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
