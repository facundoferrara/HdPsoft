/**
 * Lógica de asignación de cuerpo de control — funciones puras.
 */

/**
 * Asigna árbitro y 2 jueces a un asalto.
 *
 * @param {object[]} candidates     — fighters elegibles (no son los tiradores del asalto)
 * @param {string[]} fighterClubs   — clubs de los tiradores [clubRed, clubBlue]
 * @param {object}   roleStats      — { [fighterId]: { refCount, judgeCount } }
 * @returns {{ refereeId, judge1Id, judge2Id, sameClubWarning } | null}
 */
export function assignControlBody(candidates, fighterClubs, roleStats = {}) {
  if (candidates.length < 3) return null

  const preferred = candidates.filter((c) => !fighterClubs.includes(c.club))
  const pool = preferred.length >= 3 ? preferred : candidates
  const sameClubWarning = preferred.length < 3

  const sortedByRef = [...pool].sort(
    (a, b) => (roleStats[a.id]?.refCount ?? 0) - (roleStats[b.id]?.refCount ?? 0)
  )
  const referee = sortedByRef[0]

  const judgePool = pool.filter((c) => c.id !== referee.id)
  const sortedByJudge = [...judgePool].sort(
    (a, b) => (roleStats[a.id]?.judgeCount ?? 0) - (roleStats[b.id]?.judgeCount ?? 0)
  )

  return {
    refereeId: referee.id,
    judge1Id: sortedByJudge[0].id,
    judge2Id: sortedByJudge[1].id,
    sameClubWarning,
  }
}

/**
 * Computa estadísticas de roles para los asaltos ya generados en la ronda.
 * Usado para distribución equitativa.
 */
export function computeRoleStats(matches) {
  const stats = {}
  const update = (id, role) => {
    if (!id) return
    if (!stats[id]) stats[id] = { refCount: 0, judgeCount: 0 }
    if (role === 'ref') stats[id].refCount++
    else stats[id].judgeCount++
  }
  for (const m of matches) {
    update(m.referee_id, 'ref')
    update(m.judge_1_id, 'judge')
    update(m.judge_2_id, 'judge')
  }
  return stats
}

/**
 * Genera candidatos para un reroll de cuerpo de control.
 * Excluye: tiradores del asalto, personas en asaltos activos.
 */
export function getCandidatesForReroll(allFighters, activeFighterIds, matchFighterIds) {
  const excluded = new Set([...activeFighterIds, ...matchFighterIds])
  return allFighters.filter(
    (f) => !excluded.has(f.id) && !['tbd', 'na'].includes(f.tier)
  )
}
