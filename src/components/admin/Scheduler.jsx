import { useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useRounds } from '../../hooks/useRounds'
import { useRoundMatches } from '../../hooks/useMatches'
import { useFighters } from '../../hooks/useFighters'
import { useLeaderboard } from '../../hooks/useLeaderboard'
import { generatePairings, pairKey } from '../../utils/pairing'
import { assignControlBody, getCandidatesForReroll } from '../../utils/controlBody'
import { generateRound, activateMatch, updateMatchControlBody, registerBye } from '../../firebase/writes'
import { calcCalibrationPoints } from '../../utils/scoring'
import { matchesRef } from '../../firebase/db'
import ArenaDropZone from './ArenaDropZone'
import MatchCard from './MatchCard'
import styles from './Scheduler.module.css'

const ARENAS = [1, 2, 3, 4]

export default function Scheduler({ onRoundComplete }) {
  const { currentRound, nextRoundNumber } = useRounds()
  const { matches, loading: matchesLoading } = useRoundMatches(currentRound?.id)
  const { fighters, activeFighters, fightersMap } = useFighters()
  const { leaderboard } = useLeaderboard()
  const [generating, setGenerating] = useState(false)
  const [activeCard, setActiveCard] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Personas actualmente en un asalto activo
  const busyIds = new Set(
    matches
      .filter((m) => m.status === 'active')
      .flatMap((m) => [m.fighter_red_id, m.fighter_blue_id, m.referee_id, m.judge_1_id, m.judge_2_id])
  )

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
    if (!arena || arena < 1 || arena > 4) return
    const match = matches.find((m) => m.id === matchId)
    if (!match || match.status !== 'pending' || isBlocked(match)) return
    await activateMatch(matchId, arena)
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

      // Asignar cuerpo de control
      const roleStats = {}
      const enrichedPairs = pairs.map(({ red, blue }) => {
        const fighterIds = [red.id, blue.id]
        const fighterClubs = [red.club, blue.club]
        const candidatePool = activeFighters.filter((f) => !fighterIds.includes(f.id))
        const cb = assignControlBody(candidatePool, fighterClubs, roleStats)
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

      // Registrar bye si el algoritmo asignó uno
      if (byeFighterId) {
        // Calibration = promedio de puntos finales de la ronda que acaba de cerrar (prevRoundId)
        const lastRoundPoints = completedSnap.docs
          .filter((d) => d.data().round_id === prevRoundId)
          .flatMap((d) => [d.data().final_score_red, d.data().final_score_blue])
          .filter((v) => typeof v === 'number')
        const calibrationPts = calcCalibrationPoints(lastRoundPoints)
        await registerBye(byeFighterId, roundId, calibrationPts)
      }
    } finally {
      setGenerating(false)
    }
  }

  // ── Reroll ─────────────────────────────────────────────────────────────────

  async function handleReroll(match) {
    const matchFighterIds = [match.fighter_red_id, match.fighter_blue_id]
    const matchFighterClubs = [
      fightersMap[match.fighter_red_id]?.club,
      fightersMap[match.fighter_blue_id]?.club,
    ]
    const candidates = getCandidatesForReroll(fighters, [...busyIds], matchFighterIds)
    const cb = assignControlBody(candidates, matchFighterClubs)
    if (!cb) {
      alert('No hay suficientes árbitros disponibles para hacer reroll.')
      return
    }
    await updateMatchControlBody(match.id, cb)
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
        {allDone && matches.length > 0 && (
          <button className={`${styles.generateBtn} ${styles.breakBtn}`} onClick={onRoundComplete}>
            Cerrar ronda → descanso
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragStart={({ active }) => setActiveCard(active.id)} onDragEnd={handleDragEnd}>
        {/* Arenas */}
        <div className={styles.arenas}>
          {ARENAS.map((arena) => (
            <ArenaDropZone
              key={arena}
              arena={arena}
              activeMatch={activeMatchByArena(arena)}
              fightersMap={fightersMap}
            />
          ))}
        </div>

        {/* Grid de asaltos */}
        {matches.length > 0 && (
          <div className={styles.matchGrid}>
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                fightersMap={fightersMap}
                isBlocked={isBlocked(match)}
                onReroll={handleReroll}
              />
            ))}
          </div>
        )}

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
