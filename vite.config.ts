import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev le funzioni serverless di Vercel non girano: inoltriamo
      // direttamente al Cabildo. In produzione risponde /api/*.
      '/api/cda': {
        target: 'https://bi.lapalma.es',
        changeOrigin: true,
        rewrite: (p) => {
          const q = new URLSearchParams(p.split('?')[1] ?? '')
          const vertical = q.get('vertical') ?? 'environment'
          const out = new URLSearchParams({
            path: `/public/sc_lapalma/verticals/sql/${vertical}.cda`,
            _TRUST_USER_: 'opendata_sc_lapalma',
            dataAccessId: q.get('dataAccessId') ?? '',
            outputType: 'json',
          })
          for (const k of ['paramstart', 'paramfinish', 'paramname', 'paramcountertype']) {
            const v = q.get(k)
            if (v !== null) out.set(k, v)
          }
          return `/pentaho/plugin/cda/api/doQuery?${out}`
        },
      },
      '/api/co2': {
        target: 'https://www.demasesl.com',
        changeOrigin: true,
        rewrite: () => '/datos_actuales?token=Y29udHJvbENPMg-Y0NPMjEyMDc',
      },
    },
  },
  build: { target: 'es2022' },
})
