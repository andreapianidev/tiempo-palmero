/**
 * Buscador de topónimos sobre el callejero de la isla.
 *
 * No se pliega y no vive dentro de una sección: es la primera cosa que hace
 * alguien que abre la app buscando su pueblo.
 */

import { useMemo, useState } from 'react'
import type { GazetteerEntry } from '../../lib/api'
import { t } from '../../i18n'

/** Normaliza acentos para que «Garafia» encuentre «Garafía». */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Props {
  gazetteer: GazetteerEntry[]
  onSelect: (entry: GazetteerEntry) => void
}

export function PlaceSearch({ gazetteer, onSelect }: Props) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = fold(query.trim())
    if (q.length < 2) return []
    return gazetteer.filter((e) => fold(e.name).includes(q)).slice(0, 8)
  }, [query, gazetteer])

  return (
    <div className="search">
      <input
        type="search"
        value={query}
        placeholder={t.point.searchPlaceholder}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t.point.searchPlaceholder}
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={`${r.name}-${r.lon}-${r.lat}`}>
              <button
                onClick={() => {
                  onSelect(r)
                  setQuery('')
                }}
              >
                <span>{r.name}</span>
                <em className="dim">{r.municipality}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && results.length === 0 && (
        <p className="dim small pad">{t.point.noResults}</p>
      )}
    </div>
  )
}
