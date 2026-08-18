import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { edgeApi } from './dev/edgeApi'
import { serviceWorker } from './dev/swBuild'

/**
 * Ya no hay bloque `server.proxy`.
 *
 * Lo hubo: en desarrollo `/api/cda` y `/api/co2` se reescribían aquí y se
 * reenviaban al origen directamente, sin pasar por las funciones de `api/`. Eso
 * significaba dos cosas malas a la vez —el código que se probaba no era el que
 * se despliega, y no había ninguna cache delante— y la segunda acabó en un 429
 * de Open-Meteo en mitad de una sesión de trabajo. Ahora `edgeApi()` ejecuta
 * las funciones de verdad y respeta su `s-maxage`.
 */
export default defineConfig({
  plugins: [react(), edgeApi(), serviceWorker()],
  build: { target: 'es2022' },
  test: {
    /**
     * Fuera los árboles de trabajo de git.
     *
     * `.claude/worktrees/` son copias completas del repositorio, así que vitest
     * encontraba cada prueba tres veces y la suite tardaba 270 s en vez de 90.
     * En un repositorio cuya regla es que **cada** cambio pasa por `npm test`
     * antes de desplegarse, eso son tres minutos de peaje por cada arreglo de
     * una línea.
     */
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
