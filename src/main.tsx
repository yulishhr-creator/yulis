import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { ErrorBoundary } from '@/components/ErrorBoundary'

import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary title="Yulis could not load">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
