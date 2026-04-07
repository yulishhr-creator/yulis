import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'

const links = [
  { href: 'https://vite.dev/', label: 'Vite docs', icon: viteLogo, external: true },
  { href: 'https://react.dev/', label: 'React docs', icon: reactLogo, external: true },
  {
    href: 'https://tailwindcss.com/docs',
    label: 'Tailwind CSS',
    external: true,
  },
] as const

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-dvh bg-paper text-ink-muted dark:bg-paper-dark dark:text-stone-300">
      <a
        href="#main"
        className="focus:ring-accent sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-accent-soft focus:text-ink focus:ring-2 focus:outline-none dark:focus:bg-stone-800 dark:focus:text-stone-100"
      >
        Skip to content
      </a>

      <header className="border-line dark:border-line-dark border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 md:px-10">
          <p className="font-display text-ink dark:text-stone-100 text-lg font-semibold tracking-tight">
            yulis
          </p>
          <nav aria-label="Primary">
            <ul className="flex items-center gap-6 text-sm font-medium">
              <li>
                <a
                  href="#start"
                  className="text-ink-muted hover:text-accent dark:text-stone-400 dark:hover:text-orange-300 transition-colors"
                >
                  Start
                </a>
              </li>
              <li>
                <a
                  href="#stack"
                  className="text-ink-muted hover:text-accent dark:text-stone-400 dark:hover:text-orange-300 transition-colors"
                >
                  Stack
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main">
        <section
          id="start"
          className="mx-auto max-w-5xl px-6 pt-16 pb-20 md:px-10 md:pt-24 md:pb-28"
          aria-labelledby="hero-heading"
        >
          <div className="max-w-2xl">
            <p
              className="animate-fade-up text-accent dark:text-orange-300 mb-4 text-sm font-semibold tracking-widest uppercase"
            >
              Vite · React · TypeScript · Tailwind
            </p>
            <h1
              id="hero-heading"
              className="animate-fade-up-delay font-display text-ink dark:text-stone-100 text-4xl leading-[1.1] font-semibold tracking-tight md:text-5xl lg:text-6xl"
            >
              A fast studio for interfaces you can ship.
            </h1>
            <p className="animate-fade-up-delay-2 mt-6 text-lg leading-relaxed md:text-xl">
              This app is wired with hot module replacement, utility-first styling,
              and a warm editorial palette—edit <code className="text-ink dark:text-stone-200 bg-accent-soft/80 dark:bg-stone-800/80 rounded px-1.5 py-0.5 font-mono text-[0.9em]">src/App.tsx</code>{' '}
              and watch the page update instantly.
            </p>
            <div className="animate-fade-up-delay-2 mt-10 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setCount((c) => c + 1)}
                className="bg-accent hover:bg-accent/90 focus-visible:ring-accent rounded-full px-6 py-3 text-sm font-semibold text-stone-50 shadow-sm transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
              >
                Count is {count}
              </button>
              <span className="text-sm opacity-80">
                Interactive check that React state works.
              </span>
            </div>
          </div>

          <div
            className="animate-fade-up-delay-2 mt-16 flex items-end gap-8 border-line dark:border-line-dark border-t pt-12 md:mt-20 md:gap-12 md:pt-16"
            aria-hidden="true"
          >
            <img src={viteLogo} alt="" className="h-10 w-auto opacity-90 md:h-12" />
            <img src={reactLogo} alt="" className="h-10 w-auto opacity-90 md:h-12" />
          </div>
        </section>

        <section
          id="stack"
          className="border-line dark:border-line-dark border-t bg-paper dark:bg-paper-dark"
          aria-labelledby="stack-heading"
        >
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
            <h2
              id="stack-heading"
              className="font-display text-ink dark:text-stone-100 text-2xl font-semibold tracking-tight md:text-3xl"
            >
              What is installed
            </h2>
            <p className="mt-3 max-w-2xl text-base md:text-lg">
              Everything here is standard tooling you can extend with routers, data
              layers, and component libraries when you need them.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'Vite',
                  body: 'Dev server and optimized production builds.',
                },
                {
                  title: 'React 19',
                  body: 'UI with hooks and a modern concurrent runtime.',
                },
                {
                  title: 'TypeScript',
                  body: 'Typed components and safer refactors.',
                },
                {
                  title: 'Tailwind CSS v4',
                  body: 'Design tokens in @theme and utilities in markup.',
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="rounded-2xl border border-line bg-white/60 p-6 transition-shadow hover:shadow-md dark:border-line-dark dark:bg-stone-900/40 dark:hover:shadow-none"
                >
                  <h3 className="font-display text-ink dark:text-stone-100 text-lg font-medium">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed">{item.body}</p>
                </li>
              ))}
            </ul>

            <div className="mt-12">
              <p className="mb-4 text-sm font-medium text-ink dark:text-stone-200">
                Helpful links
              </p>
              <ul className="flex flex-wrap gap-3">
                {links.map((link) =>
                  'icon' in link ? (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="border-line dark:border-line-dark inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:shadow-sm dark:bg-stone-900/50 dark:text-stone-100 dark:hover:border-orange-400/50"
                      >
                        <img src={link.icon} alt="" className="h-4 w-4" />
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="border-line dark:border-line-dark inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:shadow-sm dark:bg-stone-900/50 dark:text-stone-100 dark:hover:border-orange-400/50"
                      >
                        {link.label}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-line dark:border-line-dark border-t">
        <div className="mx-auto max-w-5xl px-6 py-8 text-center text-sm md:px-10">
          <p>
            Run <code className="font-mono text-ink dark:text-stone-200">npm run dev</code>{' '}
            to start editing.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
