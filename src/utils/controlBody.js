/**
 * Lógica de asignación de cuerpo de control — funciones puras.
 */

/**
 * Asigna árbitro y 2 jueces a un asalto.
 *
 * @param {object[]} candidates     — fighters elegibles (no son los tiradores del asalto)
 * @param {string[]} fighterClubs   — clubs de los tiradores [clubRed, clubBlue]
 * @param {object}   roleStats      — { [fighterId]: { refCount, judgeCount } } — acumulado del evento
 * @param {object[]|null} globalStats — lista completa de elegibles, para calcular el piso de fairness
 * @returns {{ refereeId, judge1Id, judge2Id, sameClubWarning, fairnessWarning } | null}
 */
export function assignControlBody(candidates, fighterClubs, roleStats = {}, globalStats = null) {
  if (candidates.length < 3) return null

  const preferred = candidates.filter((c) => !fighterClubs.includes(c.club))
  const pool = preferred.length >= 3 ? preferred : candidates
  const sameClubWarning = preferred.length < 3

  // Árbitro: solo quienes declararon rol de arbitraje
  const refPool = pool.filter((c) => ['referee', 'both'].includes(c.role))
  if (refPool.length < 1) return null

  const sortedByRef = [...refPool].sort(
    (a, b) => (roleStats[a.id]?.refCount ?? 0) - (roleStats[b.id]?.refCount ?? 0)
  )
  const referee = sortedByRef[0]

  // Jueces: solo quienes declararon rol de jueceo
  const judgePool = pool.filter((c) => c.id !== referee.id && ['judge', 'both'].includes(c.role))
  if (judgePool.length < 2) return null

  const sortedByJudge = [...judgePool].sort(
    (a, b) => (roleStats[a.id]?.judgeCount ?? 0) - (roleStats[b.id]?.judgeCount ?? 0)
  )
  const judge1 = sortedByJudge[0]
  const judge2 = sortedByJudge[1]

  // Fairness: ¿la asignación elegida supera el piso global + 2?
  let fairnessWarning = false
  if (globalStats && globalStats.length > 0) {
    const refFloor = Math.min(...globalStats.map((f) => roleStats[f.id]?.refCount ?? 0))
    const judgeFloor = Math.min(...globalStats.map((f) => roleStats[f.id]?.judgeCount ?? 0))
    const refCount = roleStats[referee.id]?.refCount ?? 0
    const j1Count = roleStats[judge1.id]?.judgeCount ?? 0
    const j2Count = roleStats[judge2.id]?.judgeCount ?? 0
    fairnessWarning = refCount > refFloor + 2 || j1Count > judgeFloor + 2 || j2Count > judgeFloor + 2
  }

  return {
    refereeId: referee.id,
    judge1Id: judge1.id,
    judge2Id: judge2.id,
    sameClubWarning,
    fairnessWarning,
  }
}

/**
 * Genera candidatos para un reroll de cuerpo de control.
 * Excluye: tiradores del asalto, personas en asaltos activos.
 */
export function getCandidatesForReroll(allFighters, activeFighterIds, matchFighterIds) {
  const excluded = new Set([...activeFighterIds, ...matchFighterIds])
  return allFighters.filter(
    (f) => !excluded.has(f.id) && f.tier !== 'tbd' && ['referee', 'judge', 'both'].includes(f.role)
  )
}
