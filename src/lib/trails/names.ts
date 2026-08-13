/**
 * Cómo se llama un sendero, cuando el dato no trae el nombre.
 *
 * EL DATASET NO TIENE NOMBRES. Comprobado el 13 ago 2026 en las dos fuentes
 * que publican la red: el GeoJSON de CKAN (`red-de-senderos-de-titularidad-
 * insular`) trae `id_sendero`, `codigo`, `tipo`, `dificultad` y longitud, y el
 * Feature Service de ArcGIS (`senderos/FeatureServer/2`) trae `ID`,
 * `DIFICULTAD`, `FECHA`, `LONGITUD`, `TIPO`. Ninguno de los dos tiene una
 * columna de nombre. Tampoco los 1190 puntos de interés, cuyo `codigo` sí
 * incrusta el del sendero (`PDI-GR1301-00013`) pero no lo bautiza.
 *
 * Así que aquí NO se inventa ninguno. Se hacen dos cosas, las dos derivadas
 * del propio dato y comprobables:
 *
 * 1. **La nomenclatura oficial**, reconstruida del código. `GR1301` es el
 *    código de base de datos de lo que las señales de la isla llaman
 *    «GR 130.1». Es una reescritura, no una interpretación.
 * 2. **Los extremos**, que salen de la geometría contra los límites
 *    municipales que la aplicación ya carga. «GR 130.1 · Santa Cruz de La
 *    Palma → Puntallana» dice de dónde a dónde va, que para decidir si te
 *    afecta el aviso de viento es más útil que un topónimo bonito.
 *
 * Poner aquí una tabla de nombres populares escrita de memoria habría sido
 * fácil y habría envejecido mal: son cadenas que se enseñan al usuario, y una
 * equivocada manda a alguien a otro barranco.
 */

/**
 * Reescribe el código de base de datos como la nomenclatura de las señales.
 *
 * **GR**: `GR` + tres dígitos de ruta + los que sobren de etapa.
 * `GR1301` → `GR 130.1`; `GR13010` → `GR 130.10`; `GR1311` → `GR 131.1`.
 * Que la ruta son tres dígitos se sostiene en el propio inventario: los doce
 * códigos GR se reparten en `GR130*` (nueve etapas) y `GR131*` (tres), y no
 * hay ningún `GR13` ni `GR1300`.
 *
 * **PR**: `PRLP` + dos dígitos de número + dos de variante, donde `00` es el
 * sendero base y `10`, `20`, `30` son las variantes `.1`, `.2` y `.3`.
 * `PRLP0600` → `PR LP 6`; `PRLP1330` → `PR LP 13.3`.
 *
 * Lo que no encaje en ninguno de los dos moldes se devuelve tal cual: es
 * preferible enseñar un código crudo que una etiqueta bien formateada y falsa.
 */
export function trailCodeLabel(codigo: string): string {
  const gr = /^GR(\d{3})(\d+)$/.exec(codigo)
  if (gr) return `GR ${gr[1]}.${Number(gr[2])}`

  const pr = /^PRLP(\d{2})(\d{2})$/.exec(codigo)
  if (pr) {
    const number = Number(pr[1])
    const variant = Number(pr[2])
    // La variante viene en décimas: 10 → .1, 20 → .2. Un 15 no existe en el
    // inventario, y si apareciera se enseñaría entero antes que redondearlo.
    if (variant === 0) return `PR LP ${number}`
    if (variant % 10 === 0) return `PR LP ${number}.${variant / 10}`
    return `PR LP ${number}.${variant}`
  }

  return codigo
}

/**
 * Etiqueta completa: nomenclatura y extremos, si se conocen.
 *
 * Sin municipios resueltos devuelve sólo el código, que es lo que hay. No se
 * rellena con «sendero de La Palma» ni con la dificultad: repetir en el
 * nombre algo que ya está en su propia columna no informa de nada.
 */
export function trailLabel(codigo: string, from: string | null, to: string | null): string {
  const code = trailCodeLabel(codigo)
  if (!from && !to) return code
  if (from && to && from !== to) return `${code} · ${from} → ${to}`
  return `${code} · ${from ?? to}`
}
