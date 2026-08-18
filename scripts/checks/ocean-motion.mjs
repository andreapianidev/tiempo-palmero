/**
 * Prueba en vivo de si el mar se mueve: dos capturas separadas 2,5 s y el
 * porcentaje de píxeles que cambian, a varios zooms y fondos.
 *
 * Uso: node scripts/checks/ocean-motion.mjs <devUrl>
 */
import { writeFileSync } from 'node:fs'

const target = process.argv[2] ?? 'http://localhost:5173'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targets() {
  const res = await fetch('http://127.0.0.1:9222/json')
  return await res.json()
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res2, rej2) => {
            const mid = ++id
            pending.set(mid, { res: res2, rej: rej2 })
            ws.send(JSON.stringify({ id: mid, method, params }))
          })
        },
        close: () => ws.close(),
      })
    ws.onerror = (e) => reject(new Error('ws error'))
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(msg.error.message))
        else res(msg.result)
      }
    }
  })
}

async function main() {
  const pages = await targets()
  const page = pages.find((p) => p.type === 'page' && p.url.includes(target.split('//')[1]))
  if (!page) throw new Error('no hay página para ' + target)
  const cdp = await connect(page.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  // Esperar al mapa (la build de desarrollo lo expone como window.__map).
  for (let i = 0; i < 120; i++) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: '!!window.__map',
      returnByValue: true,
    })
    if (r.result.value) break
    await sleep(1000)
  }
  const hasMap = await cdp.send('Runtime.evaluate', {
    expression: '!!window.__map',
    returnByValue: true,
  })
  if (!hasMap.result.value) throw new Error('el mapa no apareció en 120 s')

  const evl = async (expr) =>
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })

  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(name, Buffer.from(r.data, 'base64'))
    console.log('captura', name)
  }

  const escena = async (nombre, lon, lat, zoom) => {
    await evl(
      `(() => { __map.jumpTo({ center: [${lon}, ${lat}], zoom: ${zoom}, pitch: 0, bearing: 0 }); return true })()`,
    )
    await sleep(6500)
    await shot(`/tmp/ocean-${nombre}-a.png`)
    await sleep(2500)
    await shot(`/tmp/ocean-${nombre}-b.png`)
  }

  // Tazacorte: mar abierto + costa a la izquierda.
  await escena('z17-relieve', -17.93, 28.64, 16.9)
  await escena('z15-relieve', -17.93, 28.64, 15.5)

  // El fondo satélite: clic en el selector del panel.
  const clicked = await evl(`(() => {
    const els = [...document.querySelectorAll('button, label, [role=button]')]
    const el = els.find((e) => /satélite|satelite/i.test(e.textContent || ''))
    if (!el) return false
    el.click()
    return true
  })()`)
  console.log('selector satélite clicado:', clicked.result.value)
  await sleep(8000)
  await escena('z17-satelite', -17.93, 28.64, 16.9)

  cdp.close()
}

main().catch((e) => {
  console.error('FALLO:', e.message)
  process.exit(1)
})
