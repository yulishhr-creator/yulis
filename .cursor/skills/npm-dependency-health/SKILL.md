---
name: npm-dependency-health
description: >-
  Runs a full dependency install health check and resolves npm ERESOLVE / peer
  dependency failures. Use when npm install or npm ci exits with 1, ERESOLVE,
  conflicting peer dependencies, or before/after changing package.json; also when
  setting up CI or onboarding so installs stay reproducible.
---

# npm dependency health (install hardening)

## When to use

- `npm install` or `npm ci` exits with code **1**
- npm prints **ERESOLVE**, **could not resolve**, or **Conflicting peer dependency**
- Adding, upgrading, or removing packages in `package.json`
- After pulling changes that touch `package.json` or `package-lock.json`
- Configuring CI (GitHub Actions, etc.) so broken trees fail fast

## Full check (run in order, from project root)

1. **Environment**
   - Prefer **Node LTS** aligned with the repo (check `engines` in `package.json` if present).
   - Run `node -v` and `npm -v` once when debugging exotic failures.

2. **Clean install probe (diagnostic)**
   - If you suspect a corrupted tree: remove `node_modules` and retry:
     - `rm -rf node_modules`
     - `npm install`
   - For **CI parity**, prefer `npm ci` when `package-lock.json` is committed (fails if lock and manifest disagree).

3. **Capture the real error**
   - Run `npm install` and read the **full** stderr (not only “exited with 1”).
   - Identify the **two (or more) packages** npm names in the conflict (e.g. “While resolving X … Found: Y”).

4. **Peer dependency conflicts (ERESOLVE) — decision tree**
   - **A. Upstream already supports your stack**  
     Upgrade the dependent package to a version whose `peerDependencies` include your major versions (e.g. plugin adds Vite 8). Verify in the package’s changelog or npm page.
   - **B. Temporary, known-safe mismatch** (common with Vite ecosystem: plugin peers lag by one major)  
     - Add or keep a **project `.npmrc`** with `legacy-peer-deps=true`, **only** with a short comment explaining *which* package is out of date on peer ranges and that you will revisit.  
     - **Do not** use `--force` casually; it hides more problems than `legacy-peer-deps`.
   - **C. Wrong duplicate**  
     If two versions of the same package appear (`npm ls <name>`), dedupe by aligning versions in `package.json` or `overrides` (npm) — use sparingly and document why.

5. **Verify the tree**
   - `npm ls --depth=0` — top-level packages resolve.
   - `npm ls <suspect-package>` — single expected version where possible.

6. **Verify the app**
   - `npm run build` (or the repo’s primary compile/test script).
   - Fix any TypeScript or runtime errors **before** declaring the install fixed.

7. **Lockfile hygiene**
   - After a successful resolution, commit **`package-lock.json`** (and **`.npmrc`** if added/changed) so teammates and CI get the same behavior.
   - Never “fix” install only locally without updating lock + config.

## CI recommendation

- Use **`npm ci`** in CI when `package-lock.json` exists.
- Run **`npm run build`** (or tests) in the same workflow after install so peer issues surface immediately.

## Anti-patterns

- Assuming “it worked on my machine” without running `npm install` from a clean state after manifest changes.
- Using **`--force`** without understanding what npm is overriding.
- Pinning **`"vite": "^8"`** next to plugins whose **documented** peers stop at Vite 7 without either upgrading the plugin or documenting `legacy-peer-deps`.

## Yulis-specific note

- **`vite-plugin-pwa`** historically declared peers only through Vite 7 while the app uses **Vite 8**. The repo uses **`.npmrc`** with `legacy-peer-deps=true` until the plugin’s peer range includes Vite 8 (then remove the flag and re-verify).
