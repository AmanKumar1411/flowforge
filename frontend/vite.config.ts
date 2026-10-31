import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The test-login form lets anyone pick who to be: a production build must never ship it
  // (SEC-F7, H12). Keep the flag in .env.development.local; the QA stack builds with --mode test.
  if (mode === 'production' && loadEnv(mode, process.cwd(), 'VITE_').VITE_DEV_LOGIN === 'true') {
    throw new Error(
      'VITE_DEV_LOGIN=true in a production build would ship the test-login form. ' +
        'Set it in .env.development.local (vite dev) or build with --mode test.',
    )
  }
  return { plugins: [react()] }
})
