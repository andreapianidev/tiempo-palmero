/**
 * La Vía Láctea: de cinco curvas de nivel a un mapa de brillo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTO Y QUÉ NO ES. **No es una fotografía.** Es el contorno de la Vía
 * Láctea de d3-celestial (Olaf Frohn, BSD-3, la misma fuente de la que ya salen
 * las figuras de las constelaciones), que son cinco polígonos anidados: cinco
 * curvas de nivel de brillo, de la más tenue a la del núcleo. Se rasterizan a
 * un mapa equirrectangular y se suavizan, y lo que sale se parece a una foto
 * sin serlo. El panel lo dice con esas palabras.
 *
 * LOS AGUJEROS SON LA MITAD DEL DIBUJO. Los cinco contornos traen 197 anillos
 * interiores entre todos: son las nebulosas oscuras —la Fenditura del Cisne, el
 * Saco de Carbón— y son lo que hace que la Vía Láctea se vea partida en dos por
 * una banda negra. Rellenar solo los contornos exteriores daría una mancha
 * uniforme que no se parece a nada de lo que se ve desde la Cumbre.
 *
 * Por eso el relleno es por **regla par-impar**: se cortan todos los anillos
 * —exteriores e interiores por igual—, se ordenan los cortes y se pinta entre
 * pares. Los agujeros salen solos, sin tener que saber cuál es agujero de cuál.
 *
 * SE ESCANEA POR MERIDIANOS Y NO POR FILAS, y esto costó una raya blanca de
 * lado a lado del cielo antes de entenderlo. La Vía Láctea **da la vuelta
 * entera**, así que sus contornos exteriores no son bucles cerrados dentro de
 * una franja de ascensión recta: rodean la esfera. Recorriendo una fila de
 * declinación, la paridad de los cortes no cierra —a −57,6° salían cuatro
 * cortes y el segundo par abarcaba 234 grados— y el relleno salía invertido.
 *
 * Recorriendo un MERIDIANO no puede pasar: la declinación no es periódica y
 * ningún anillo llega al polo. Empezando desde el polo sur, que está fuera de
 * todos los contornos —el más austral se queda en −74,9°—, la paridad es
 * correcta por construcción.
 *
 * Y las aristas se leen por el camino corto: un tramo de +179 a −179 son dos
 * grados, no trescientos cincuenta y ocho. Sin eso, cada arista de la costura
 * se lee como una que atraviesa el cielo entero.
 *
 * POR QUÉ UN MAPA Y NO TRIÁNGULOS. La otra opción era triangular los polígonos
 * y dibujarlos. Con 197 agujeros eso pide un recortador de orejas con puentes,
 * que son doscientas líneas delicadas para acabar con bandas de brillo
 * escalonadas — cinco niveles y cinco escalones. Rasterizar y suavizar cuesta
 * cuarenta líneas, sale continuo, y el fichero es más pequeño.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL TAMAÑO DEL MAPA ESTÁ ELEGIDO CONTRA LO QUE SE VE. 1440 × 720 son 0,25° por
 * píxel. La pantalla enseña 36,87° de cielo en unos 800 píxeles, o sea 0,046°
 * por píxel: el mapa está cinco veces por debajo de la resolución de la
 * pantalla, y por eso se suaviza en vez de interpolarse a lo bruto. Subir a
 * 2880 × 1440 multiplicaría el fichero por cuatro para dibujar detalle que la
 * fuente no tiene: los contornos originales son polígonos con 30 676 puntos en
 * todo el cielo, o sea un punto cada 0,7° de perímetro.
 *
 * Uso: `npm run prepare-vialactea`
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const SOURCE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/mw.json'
const OUT = 'public/cielo/vialactea.png'

/** 0,25° por píxel. Ver la cabecera. */
const WIDTH = 1440
const HEIGHT = 720

/**
 * Cuánto suma cada nivel, de 0 a 255.
 *
 * Los cinco están anidados, así que el núcleo recibe la suma de los cinco: 200.
 * No llega a 255 a propósito — dejar el techo libre significa que el
 * sombreador puede escalar el conjunto sin recortar el pico, y que el brillo
 * final lo decide la noche que haga y no este fichero.
 */
const LEVEL_STEP = 40

async function main() {
  const res = await fetch(SOURCE, { headers: { 'user-agent': 'tiempo-palmero/1.0' } })
  if (!res.ok) throw new Error(`mw.json: HTTP ${res.status}`)
  const geo = (await res.json()) as {
    features: { id: string; geometry: { coordinates: number[][][][] } }[]
  }

  const accumulator = new Float32Array(WIDTH * HEIGHT)
  let rings = 0
  let points = 0
  let holes = 0

  for (const feature of geo.features) {
    const all: number[][][] = []
    for (const polygon of feature.geometry.coordinates) {
      for (let i = 0; i < polygon.length; i++) {
        all.push(polygon[i])
        points += polygon[i].length
        if (i > 0) holes++
      }
    }
    rings += all.length

    // Las aristas, con el salto de ascensión recta ya resuelto por el camino
    // corto: un tramo de +179 a −179 son dos grados, no trescientos cincuenta y
    // ocho. Sin esto, cada arista que cruza la costura se lee como una que
    // atraviesa el cielo entero.
    const edges: { x1: number; y1: number; dx: number; dy: number }[] = []
    for (const ring of all) {
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i]
        const [x2, y2] = ring[(i + 1) % ring.length]
        const dx = (((x2 - x1 + 540) % 360) - 180)
        if (dx === 0) continue
        edges.push({ x1, y1, dx, dy: y2 - y1 })
      }
    }

    for (let col = 0; col < WIDTH; col++) {
      const lon = -180 + ((col + 0.5) * 360) / WIDTH
      const hits: number[] = []
      for (const e of edges) {
        // ¿Cruza esta arista el meridiano de esta columna? `t` es la distancia
        // con signo de `x1` a `lon` por el camino corto.
        const t = ((lon - e.x1 + 540) % 360) - 180
        const inside = e.dx > 0 ? t >= 0 && t < e.dx : t <= 0 && t > e.dx
        if (!inside) continue
        hits.push(e.y1 + (t / e.dx) * e.dy)
      }
      if (hits.length < 2) continue
      hits.sort((a, b) => a - b)
      for (let i = 0; i + 1 < hits.length; i += 2) {
        // De declinación a filas. La fila 0 es el polo norte.
        const rowFrom = ((90 - hits[i + 1]) * HEIGHT) / 180
        const rowTo = ((90 - hits[i]) * HEIGHT) / 180
        for (
          let row = Math.max(0, Math.floor(rowFrom));
          row < Math.min(HEIGHT, Math.ceil(rowTo));
          row++
        ) {
          // Cobertura parcial en los dos extremos: sin esto, el borde sale con
          // dientes de sierra de un cuarto de grado.
          const coverage = Math.max(0, Math.min(row + 1, rowTo) - Math.max(row, rowFrom))
          accumulator[row * WIDTH + col] += LEVEL_STEP * coverage
        }
      }
    }
  }

  // Suavizado. Tres pasadas de caja de 5 píxeles se acercan bastante a una
  // gaussiana y cuestan lo que cuestan: 1,25° de radio, que es el orden del
  // detalle que la fuente de verdad tiene.
  const blurred = blur(accumulator, 3, 2)

  const png = new PNG({ width: WIDTH, height: HEIGHT, colorType: 0 })
  let peak = 0
  for (let i = 0; i < blurred.length; i++) peak = Math.max(peak, blurred[i])
  // `png.data` SIEMPRE es RGBA aunque el fichero se escriba en gris: `colorType`
  // solo decide cómo se codifica al guardar. Escribir un byte por píxel deja la
  // imagen comprimida a un cuarto de ancho y repetida cuatro veces, que es
  // exactamente lo que salió la primera vez.
  for (let i = 0; i < blurred.length; i++) {
    const v = Math.round(Math.max(0, Math.min(255, blurred[i])))
    png.data[i * 4] = v
    png.data[i * 4 + 1] = v
    png.data[i * 4 + 2] = v
    png.data[i * 4 + 3] = 255
  }

  mkdirSync('public/cielo', { recursive: true })
  const buffer = PNG.sync.write(png, { colorType: 0, deflateLevel: 9 })
  writeFileSync(OUT, buffer)

  console.log(`Vía Láctea: ${geo.features.length} niveles, ${rings} anillos (${holes} agujeros), ${points} puntos`)
  console.log(`Mapa ${WIDTH} × ${HEIGHT} (${(360 / WIDTH).toFixed(2)}° por píxel), pico ${peak.toFixed(0)}/255`)
  console.log(`${OUT}: ${(buffer.length / 1024).toFixed(1)} KB`)
}

/** Desenfoque de caja repetido, con la costura de la ascensión recta cosida. */
function blur(src: Float32Array, passes: number, radius: number): Float32Array {
  let current = src
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(current.length)
    // Horizontal, dando la vuelta: la ascensión recta es un círculo y cortar
    // ahí dejaría una raya vertical en mitad del cielo.
    for (let row = 0; row < HEIGHT; row++) {
      for (let col = 0; col < WIDTH; col++) {
        let sum = 0
        for (let d = -radius; d <= radius; d++) {
          sum += current[row * WIDTH + (((col + d) % WIDTH) + WIDTH) % WIDTH]
        }
        next[row * WIDTH + col] = sum / (2 * radius + 1)
      }
    }
    // Vertical, sin dar la vuelta: los polos no se tocan entre sí.
    const out = new Float32Array(current.length)
    for (let row = 0; row < HEIGHT; row++) {
      for (let col = 0; col < WIDTH; col++) {
        let sum = 0
        let n = 0
        for (let d = -radius; d <= radius; d++) {
          const r = row + d
          if (r < 0 || r >= HEIGHT) continue
          sum += next[r * WIDTH + col]
          n++
        }
        out[row * WIDTH + col] = sum / n
      }
    }
    current = out
  }
  return current
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
