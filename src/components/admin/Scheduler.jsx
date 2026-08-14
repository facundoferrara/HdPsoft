import { useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useRounds } from '../../hooks/useRounds'
import { useRoundMatches } from '../../hooks/useMatches'
import { useFighters } from '../../hooks/useFighters'
import { useLeaderboard } from '../../hooks/useLeaderboard'
import { useControlStats } from '../../hooks/useControlStats'
import { generatePairings, pairKey } from '../../utils/pairing'
import { assignControlBody, getCandidatesForReroll } from '../../utils/controlBody'
import { generateRound, activateMatch, deactivateMatch, updateMatchWeapon, updateMatchControlBody, registerBye, cancelRound, closeRound } from '../../firebase/writes'
import { matchesRef } from '../../firebase/db'
import ArenaDropZone from './ArenaDropZone'
import MatchCard from './MatchCard'
import MatchScoresheet from './MatchScoresheet'
import styles from './Scheduler.module.css'

const ARENAS = [1, 2, 3]

export default function Scheduler({ onRoundComplete }) {
  const { currentRound, nextRoundNumber } = useRounds()
  const { matches, loading: matchesLoading } = useRoundMatches(currentRound?.id)
  const { fighters, activeFighters, controlBodyEligible, fightersMap } = useFighters()
  const { leaderboard } = useLeaderboard()
  const { statsMap } = useControlStats()
  const [resultMatchId, setResultMatchId] = useState(null)
  const [selectedMatchId, setSelectedMatchId] = useState(null)

  function seedRoleStats() {
    const roleStats = {}
    for (const f of controlBodyEligible) {
      roleStats[f.id] = {
        refCount: statsMap[f.id]?.referee_count ?? 0,
        judgeCount: statsMap[f.id]?.judge_count ?? 0,
      }
    }
    return roleStats
  }
  const [generating, setGenerating] = useState(false)
  const [activeCard, setActiveCard] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Personas actualmente en un asalto activo
  const busyIds = new Set(
    matches
      .filter((m) => m.status === 'active')
      .flatMap((m) => [m.fighter_red_id, m.fighter_blue_id, m.referee_id, m.judge_1_id, m.judge_2_id])
  )

  const nextMatchNumber = () => {
    const assigned = matches.filter((m) => m.match_number != null)
    return assigned.length > 0 ? Math.max(...assigned.map((m) => m.match_number)) + 1 : 1
  }

  const isBlocked = (match) =>
    match.status === 'pending' &&
    [match.fighter_red_id, match.fighter_blue_id, match.referee_id, match.judge_1_id, match.judge_2_id]
      .some((id) => busyIds.has(id))

  const activeMatchByArena = (arena) =>
    matches.find((m) => m.status === 'active' && m.arena === arena) ?? null

  const pendingMatches = matches.filter((m) => ['pending', 'active'].includes(m.status))
  const allDone =
    matches.length > 0 &&
    matches.every((m) => m.status === 'complete' || m.status === 'cancelled')

  // ── Drag end ───────────────────────────────────────────────────────────────

  async function handleDragEnd({ active, over }) {
    setActiveCard(null)
    if (!over) return
    const matchId = active.id
    const arena = Number(over.id)
    if (!arena || arena < 1 || arena > ARENAS.length) return
    const match = matches.find((m) => m.id === matchId)
    if (!match || match.status !== 'pending' || isBlocked(match)) return
    if (activeMatchByArena(arena)) return // arena ya ocupada — evita pisar un asalto activo
    await activateMatch(matchId, arena, nextMatchNumber())
  }

  async function handleDeactivate(matchId) {
    await deactivateMatch(matchId)
  }

  async function handleUpdateWeapon(matchId, weaponName) {
    await updateMatchWeapon(matchId, weaponName)
  }

  // ── Selección point & click (alternativa al drag&drop) ────────────────────────

  function handleCardClick(match) {
    if (match.status !== 'pending' || isBlocked(match)) return
    setSelectedMatchId((prev) => (prev === match.id ? null : match.id))
  }

  async function handleArenaClick(arena) {
    const occupant = activeMatchByArena(arena)
    if (occupant) {
      // Arena ocupada: si hay un asalto seleccionado esperando, cancelamos esa selección
      // en vez de asignarlo encima; si no, es el click normal que abre resultados.
      if (selectedMatchId) setSelectedMatchId(null)
      else setResultMatchId(occupant.id)
      return
    }
    if (!selectedMatchId) return
    const match = matches.find((m) => m.id === selectedMatchId)
    setSelectedMatchId(null)
    if (!match || match.status !== 'pending' || isBlocked(match)) return
    await activateMatch(selectedMatchId, arena, nextMatchNumber())
  }

  // ── Generación de ronda ────────────────────────────────────────────────────

  async function handleGenerateRound() {
    if (generating) return
    setGenerating(true)
    try {
      // Capturar la ronda actual ANTES de generar la nueva (evita race condition con onSnapshot)
      const prevRoundId = currentRound?.id

      // Construir set de pares pasados desde Firestore — incluye cancelled (antirepetición real)
      const completedSnap = await getDocs(
        query(matchesRef, where('status', 'in', ['complete', 'cancelled']))
      )
      const pastPairs = new Set(
        completedSnap.docs.map((d) => pairKey(d.data().fighter_red_id, d.data().fighter_blue_id))
      )

      // Mergear datos de leaderboard (total_points, bye_count) con fighters
      const leaderMap = Object.fromEntries(leaderboard.map((e) => [e.id, e]))
      const enrichedFighters = activeFighters.map((f) => ({
        ...f,
        total_points: leaderMap[f.id]?.total_points ?? 0,
        bye_count: leaderMap[f.id]?.bye_count ?? 0,
      }))

      const { pairs, byeFighterId } = generatePairings(enrichedFighters, pastPairs)

      // Asignar cuerpo de control — arranca de los contadores acumulados de todo el evento
      const roleStats = seedRoleStats()
      const enrichedPairs = pairs.map(({ red, blue }) => {
        const fighterIds = [red.id, blue.id]
        const fighterClubs = [red.club, blue.club]
        const candidatePool = controlBodyEligible.filter((f) => !fighterIds.includes(f.id))
        const cb = assignControlBody(candidatePool, fighterClubs, roleStats, controlBodyEligible)
        // Actualizar roleStats para distribuir equitativamente
        if (cb) {
          roleStats[cb.refereeId] = {
            refCount: (roleStats[cb.refereeId]?.refCount ?? 0) + 1,
            judgeCount: roleStats[cb.refereeId]?.judgeCount ?? 0,
          }
          ;[cb.judge1Id, cb.judge2Id].forEach((jid) => {
            roleStats[jid] = {
              refCount: roleStats[jid]?.refCount ?? 0,
              judgeCount: (roleStats[jid]?.judgeCount ?? 0) + 1,
            }
          })
        }
        return { red, blue, ...(cb ?? {}), sameClubWarning: cb?.sameClubWarning ?? false }
      })

      const roundId = await generateRound(nextRoundNumber, enrichedPairs)

      // Registrar bye — calibración diferida a cierre de ronda (applyCalibration)
      if (byeFighterId) {
        await registerBye(byeFighterId, roundId, null)
      }
    } finally {
      setGenerating(false)
    }
  }

  // ── Anular ronda ───────────────────────────────────────────────────────────

  async function handleCancelRound() {
    if (!currentRound) return
    if (!window.confirm(`¿Anular Ronda ${currentRound.round_number}? Se cancelarán todos sus asaltos.`)) return
    const pendingIds = matches.filter((m) => m.status === 'pending').map((m) => m.id)
    await cancelRound(currentRound.id, pendingIds)
  }

  // ── Reroll ─────────────────────────────────────────────────────────────────

  async function handleReroll(match) {
    const matchFighterIds = [match.fighter_red_id, match.fighter_blue_id]
    const matchFighterClubs = [
      fightersMap[match.fighter_red_id]?.club,
      fightersMap[match.fighter_blue_id]?.club,
    ]
    const candidates = getCandidatesForReroll(fighters, [...busyIds], matchFighterIds)
    const cb = assignControlBody(candidates, matchFighterClubs, seedRoleStats(), controlBodyEligible)
    if (!cb) {
      alert('No hay suficientes árbitros disponibles para hacer reroll.')
      return
    }
    await updateMatchControlBody(match.id, cb, {
      refereeId: match.referee_id, judge1Id: match.judge_1_id, judge2Id: match.judge_2_id,
    })
  }

  // ── Reasignación manual de árbitro/juez ───────────────────────────────────────

  function getEligibleForMatch(match) {
    return getCandidatesForReroll(fighters, [...busyIds], [match.fighter_red_id, match.fighter_blue_id])
  }

  async function handleAssignRole(match, role, fighterId) {
    const roleField = { referee: 'refereeId', judge1: 'judge1Id', judge2: 'judge2Id' }[role]
    const next = {
      refereeId: match.referee_id,
      judge1Id: match.judge_1_id,
      judge2Id: match.judge_2_id,
      fairnessWarning: match.fairness_warning ?? false,
    }
    next[roleField] = fighterId
    const redClub = fightersMap[match.fighter_red_id]?.club
    const blueClub = fightersMap[match.fighter_blue_id]?.club
    next.sameClubWarning = [redClub, blueClub].includes(fightersMap[fighterId]?.club)
    await updateMatchControlBody(match.id, next, {
      refereeId: match.referee_id, judge1Id: match.judge_1_id, judge2Id: match.judge_2_id,
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (matchesLoading) return <div className={styles.loading}>Cargando...</div>

  return (
    <div className={styles.container}>
      {/* Header de ronda */}
      <div className={styles.roundHeader}>
        {currentRound ? (
          <span className={styles.roundTitle}>Ronda {currentRound.round_number}</span>
        ) : (
          <span className={styles.roundTitle}>Sin ronda activa</span>
        )}
        {(!currentRound || allDone) && (
          <button
            className={styles.generateBtn}
            onClick={handleGenerateRound}
            disabled={generating || activeFighters.length < 4}
          >
            {generating ? 'Generando...' : `Generar Ronda ${nextRoundNumber}`}
          </button>
        )}
        {currentRound && !allDone && matches.every((m) => m.status === 'pending') && (
          <button className={`${styles.generateBtn} ${styles.cancelBtn}`} onClick={handleCancelRound}>
            Anular ronda
          </button>
        )}
        {allDone && matches.length > 0 && (
          <button className={`${styles.generateBtn} ${styles.breakBtn}`} onClick={async () => {
            await closeRound(currentRound.id)
            onRoundComplete()
          }}>
            Cerrar ronda → descanso
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragStart={({ active }) => setActiveCard(active.id)} onDragEnd={handleDragEnd}>
        <div className={styles.boardLayout}>
          {/* Arenas */}
          <div className={styles.arenas}>
            {ARENAS.map((arena) => (
              <ArenaDropZone
                key={arena}
                arena={arena}
                activeMatch={activeMatchByArena(arena)}
                fightersMap={fightersMap}
                onArenaClick={handleArenaClick}
                assignable={!!selectedMatchId}
                onDeactivate={handleDeactivate}
              />
            ))}
          </div>

          {/* Grid de asaltos — se reemplaza por la planilla de carga al elegir un asalto */}
          {resultMatchId ? (
            <div className={styles.matchColumn}>
              <MatchScoresheet
                key={resultMatchId}
                matchId={resultMatchId}
                onBack={() => setResultMatchId(null)}
              />
            </div>
          ) : matches.length > 0 && (
            <div className={styles.matchColumn}>
              <h3 className={styles.matchColumnTitle}>Asaltos de la ronda</h3>
              <div className={styles.matchGrid}>
                {matches.filter((m) => m.status !== 'complete' && m.status !== 'cancelled').map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    fightersMap={fightersMap}
                    isBlocked={isBlocked(match)}
                    onReroll={handleReroll}
                    candidates={getEligibleForMatch(match)}
                    onAssignRole={handleAssignRole}
                    onDeactivate={handleDeactivate}
                    onUpdateWeapon={handleUpdateWeapon}
                    onCardClick={handleCardClick}
                    isSelected={selectedMatchId === match.id}
                  />
                ))}
              </div>
              {matches.some((m) => m.status === 'complete' || m.status === 'cancelled') && (
                <>
                  <div className={styles.completedSeparator}>Conclusos</div>
                  <div className={styles.matchGrid}>
                    {matches.filter((m) => m.status === 'complete' || m.status === 'cancelled').map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        fightersMap={fightersMap}
                        isBlocked={false}
                        onReroll={handleReroll}
                        candidates={[]}
                        onAssignRole={handleAssignRole}
                        onDeactivate={handleDeactivate}
                        onUpdateWeapon={handleUpdateWeapon}
                        onCardClick={handleCardClick}
                        isSelected={false}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <MatchCard
              match={matches.find((m) => m.id === activeCard)}
              fightersMap={fightersMap}
              isBlocked={false}
              onReroll={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {matches.length === 0 && !currentRound && (
        <div className={styles.empty}>
          Generá la primera ronda para comenzar el torneo.
        </div>
      )}
    </div>
  )
}
