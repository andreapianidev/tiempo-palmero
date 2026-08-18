import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { setDataOrigin } from './lib/endpoints'
import { registerServiceWorker } from './pwa/register'
import './styles.css'

// En la web los datos están donde está la app. Se declara igual que en una
// aplicación empaquetada —que no tiene origen— para que el núcleo tenga una
// sola manera de construir una URL. Ver `lib/endpoints.ts`.
setDataOrigin(window.location.origin)

// La aplicación se puede instalar: ver `src/sw/`.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
