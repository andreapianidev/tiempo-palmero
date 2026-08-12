/**
 * Gráfica de línea en SVG. Sin librerías: son cuatro ejes y un `path`, y una
 * dependencia de gráficas pesa más que todo el motor de interpolación.
 *
 * Solo dibuja. No sabe de dónde salen los puntos ni qué significan: quien la
 * usa decide la variable, el formato y el color. Los huecos son parte del
 * dibujo, no un detalle: una estación que dejó de transmitir tres horas tiene
 * que verse cortada, porque unir esos dos extremos con una recta inventa la
 * medida que falta.
 */

import { useId, useMemo, useRef, useState } from 'react'

export interface ChartPoint {
  x: number
  y: number | null
}

interface Props {
  points: readonly ChartPoint[]
  /** Extremos del eje X, para que varias gráficas compartan escala. */
  domain: [number, number]
  color: string
  unit: string
  formatX: (x: number) => string
  formatY: (y: number) => string
  /** Un salto mayor que esto corta la línea en vez de cruzarlo. */
  gapMs: number
  height?: number
  ariaLabel: string
}

const PAD = { top: 10, right: 8, bottom: 20, left: 38 }

export function LineChart({
  points,
  domain,
  color,
  unit,
  formatX,
  formatY,
  gapMs,
  height = 150,
  ariaLabel,
}: Props) {
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<ChartPoint | null>(null)
  // Ancho fijo del viewBox: el SVG escala solo con `width: 100%`, así que no
  // hace falta medir el contenedor ni volver a dibujar al redimensionar.
  const W = 320
  const H = height

  const scale = useMemo(() => {
    const ys = points.map((p) => p.y).filter((y): y is number => y !== null)
    if (!ys.length) return null
    let lo = Math.min(...ys)
    let hi = Math.max(...ys)
    // Una serie plana (una estación con 20,0 °C toda la noche) daría altura
    // cero y una línea pegada al borde.
    if (hi - lo < 1e-6) {
      lo -= 0.5
      hi += 0.5
    }
    const margin = (hi - lo) * 0.12
    lo -= margin
    hi += margin
    const [x0, x1] = domain
    const sx = (x: number) => PAD.left + ((x - x0) / Math.max(1, x1 - x0)) * (W - PAD.left - PAD.right)
    const sy = (y: number) => PAD.top + (1 - (y - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
    return { lo, hi, sx, sy }
  }, [points, domain, H])

  const { path, area } = useMemo(() => {
    if (!scale) return { path: '', area: '' }
    const segments: string[] = []
    const areas: string[] = []
    let current: { x: number; y: number }[] = []
    const flush = () => {
      if (current.length < 2) {
        // Un punto suelto no dibuja línea; se marca aparte como punto.
        current = []
        return
      }
      segments.push(current.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '))
      const base = H - PAD.bottom
      areas.push(
        `M${current[0].x.toFixed(1)} ${base.toFixed(1)} ` +
          current.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
          ` L${current[current.length - 1].x.toFixed(1)} ${base.toFixed(1)} Z`,
      )
      current = []
    }

    let prevX: number | null = null
    for (const p of points) {
      if (p.y === null) {
        flush()
        prevX = null
        continue
      }
      if (prevX !== null && p.x - prevX > gapMs) flush()
      current.push({ x: scale.sx(p.x), y: scale.sy(p.y) })
      prevX = p.x
    }
    flush()
    return { path: segments.join(' '), area: areas.join(' ') }
  }, [points, scale, gapMs, H])

  if (!scale) {
    return <p className="dim small">Sin datos para dibujar en este intervalo.</p>
  }

  const yTicks = [scale.lo, (scale.lo + scale.hi) / 2, scale.hi]
  const xTicks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]]

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const x = domain[0] + ratio * (domain[1] - domain[0])
    let best: ChartPoint | null = null
    let bestDist = Infinity
    for (const p of points) {
      if (p.y === null) continue
      const d = Math.abs(p.x - x)
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    // Fuera de la serie no se inventa una lectura cercana.
    setHover(best && bestDist <= gapMs * 2 ? best : null)
  }

  return (
    <figure className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={PAD.left}
              y={PAD.top}
              width={W - PAD.left - PAD.right}
              height={H - PAD.top - PAD.bottom}
            />
          </clipPath>
          <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((y) => (
          <g key={y}>
            <line
              className="chart-grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scale.sy(y)}
              y2={scale.sy(y)}
            />
            <text className="chart-tick" x={PAD.left - 4} y={scale.sy(y) + 3} textAnchor="end">
              {formatY(y)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {area && <path d={area} fill={`url(#${clipId}-fill)`} />}
          {path && <path className="chart-line" d={path} stroke={color} />}
          {hover && hover.y !== null && (
            <>
              <line
                className="chart-cursor"
                x1={scale.sx(hover.x)}
                x2={scale.sx(hover.x)}
                y1={PAD.top}
                y2={H - PAD.bottom}
              />
              <circle cx={scale.sx(hover.x)} cy={scale.sy(hover.y)} r="3" fill={color} />
            </>
          )}
        </g>

        {xTicks.map((x, i) => (
          <text
            key={x}
            className="chart-tick"
            x={scale.sx(x)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {formatX(x)}
          </text>
        ))}
      </svg>
      <figcaption className="mono small dim" aria-live="polite">
        {hover && hover.y !== null
          ? `${formatX(hover.x)} · ${formatY(hover.y)} ${unit}`
          : ' '}
      </figcaption>
    </figure>
  )
}
