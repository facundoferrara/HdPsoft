/**
 * Lógica de emparejamiento suizo — ejecutada en cliente al generar cada ronda.
 * Todas las funciones son puras.
 *
 * Nomenclatura de tiers: 'boffer' < 'nylon' < 'acero'
 */

const TIER_ORDER = { boffer: 0, nylon: 1, acero: 2 }

/**
 * Retorna el tier menor entre dos tiradores — define el match_tier del asalto.
 */
export function resolveMatchTier(tierA, tierB) {
  return TIER_ORDER[tierA] <= TIER_ORDER[tierB] ? tierA : tierB
}

/**
 * Asigna rojo/azul al azar a un par de tiradores.
 * @returns {{ red: fighter, blue: fighter }}
 */
export function assignColors(fighterA, fighterB) {
  return Math.random() < 0.5
    ? { red: fighterA, blue: fighterB }
    : { red: fighterB, blue: fighterA }
}

/**
 * Genera los emparejamientos de una ronda usando sistema suizo.
 *
 * Algoritmo:
 *   1. Ordena el pool de peor a mejor score acumulado.
 *   2. Itera pareando por diferencia mínima de puntaje (restricción dura: antirepetición).
 *   3. Segunda pasada: intenta swap de pares mismo-club con par adyacente (opción C).
 *   4. El tirador sin pareja al final recibe bye (ver selectByeFighter).
 *
 * @param {object[]} fighters       — tiradores activos con { id, club, total_points, bye_count }
 * @param {Set<string>} pastPairs   — set de strings "idA|idB" (siempre id menor primero)
 * @returns {{ pairs: Array<{red, blue}>, byeFighterId: string|null }}
 */
export function generatePairings(fighters, pastPairs) {
  // Solo activos (boffer/nylon/acero)
  const pool = [...fighters].sort((a, b) => a.total_points - b.total_points)

  const used = new Set()
  const pairs = []

  for (let i = 0; i < pool.length; i++) {
    if (used.has(pool[i].id)) continue

    // Busca el candidato más cercano en score que no repita pareja
    let paired = false
    for (let j = i + 1; j < pool.length; j++) {
      if (used.has(pool[j].id)) continue
      const key = pairKey(pool[i].id, pool[j].id)
      if (pastPairs.has(key)) continue

      used.add(pool[i].id)
      used.add(pool[j].id)
      pairs.push(assignColors(pool[i], pool[j]))
      paired = true
      break
    }

    // Si no encontró pareja válida, este tirador candidateará bye
  }

  // Segunda pasada — swap anti-mismo-club (opción C)
  applyClubSwaps(pairs, pastPairs)

  // Tirador sin pareja
  const byeFighter = pool.find((f) => !used.has(f.id)) ?? null
  const byeFighterId = selectByeFighter(byeFighter, pool, pairs, used)

  return { pairs, byeFighterId }
}

/**
 * Intenta swaps de pares mismo-club con el par adyacente en el ranking.
 * Modifica `pairs` in-place.
 */
function applyClubSwaps(pairs, pastPairs) {
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]
    if (p.red.club === p.blue.club) {
      // Busca par adyacente con quien hacer swap
      for (let j = i + 1; j < pairs.length; j++) {
        const q = pairs[j]
        // Candidatos de swap: (red[i], red[j]) y (blue[i], blue[j])
        const swap1Valid =
          p.red.club !== q.red.club &&
          p.blue.club !== q.blue.club &&
          !pastPairs.has(pairKey(p.red.id, q.red.id)) &&
          !pastPairs.has(pairKey(p.blue.id, q.blue.id))

        if (swap1Valid) {
          // Swap: p.red con q.red
          const tmp = p.red
          pairs[i] = assignColors(tmp, p.blue)
          pairs[j] = assignColors(q.red, q.blue)
          // Re-asignar colores al azar en el par swapeado
          pairs[i] = assignColors(tmp, q.red)   // ex-red[i] con ex-red[j]
          pairs[j] = assignColors(p.blue, q.blue)
          break
        }
      }
    }
  }
}

/**
 * Lógica de selección del tirador que recibe bye.
 * Si el candidato natural ya recibió un bye, busca en el tope del ranking.
 */
function selectByeFighter(naturalCandidate, pool, pairs, used) {
  if (!naturalCandidate) return null
  if (naturalCandidate.bye_count === 0) return naturalCandidate.id

  // Busca en el tope del ranking (mejor score) alguien con bye_count === 0
  const topCandidate = [...pool]
    .reverse()
    .find((f) => !used.has(f.id) && f.bye_count === 0)

  return (topCandidate ?? naturalCandidate).id
}

/** Genera una clave canónica para un par, siempre con el id menor primero. */
export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}
