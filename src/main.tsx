import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { setDataOrigin } from './lib/endpoints'
import './styles.css'

// En la web los datos están donde está la app. Se declara igual que lo hará el
// escritorio —que no tiene origen— para que el núcleo tenga una sola manera de
// construir una URL. Ver `lib/endpoints.ts`.
setDataOrigin(window.location.origin)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
