import { useState, useEffect, useMemo } from 'react'
import Leaderboard from '../components/display/Leaderboard'
import Carousel from '../components/display/Carousel'
import PairedStats from '../components/display/PairedStats'
import { useEventStatus } from '../hooks/useEventStatus'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useFighters } from '../hooks/useFighters'
import styles from './Display.module.css'

const fmt = (v) => v.toFixed(2)
const pct = (v) => `${Math.round(v * 100)}%`

function buildTriads(entries) {
  const mc = (e) => e.matches_complete ?? 1
  return [
    {
      left: {
        title: 'Cabeza',
        subtitle: 'Golpes limpios / asalto',
        entries: entries.map((e) => ({ ...e, value: (e.clean_head_hits ?? 0) / mc(e), total: e.clean_head_hits ?? 0 })),
        format: fmt,
        formatSecondary: (e) => `(${e.total}/${e.matches_complete ?? 1})`,
      },
      center: {
        title: 'Cuerpo',
        subtitle: 'Golpes limpios / asalto',
        entries: entries.map((e) => ({ ...e, value: (e.clean_body_hits ?? 0) / mc(e), total: e.clean_body_hits ?? 0 })),
        format: fmt,
        formatSecondary: (e) => `(${e.total}/${e.matches_complete ?? 1})`,
      },
      right: {
        title: 'Manos',
        subtitle: 'Golpes limpios / asalto',
        entries: entries.map((e) => ({ ...e, value: (e.clean_hand_hits ?? 0) / mc(e), total: e.clean_hand_hits ?? 0 })),
        format: fmt,
        formatSecondary: (e) => `(${e.total}/${e.matches_complete ?? 1})`,
      },
    },
    {
      left: {
        title: 'Pericia Defensiva',
        subtitle: 'Puntos iniciales defendidos',
        entries: entries.map((e) => ({
          ...e,
          value: Math.max(0, Math.min(1, 1 - (e.points_lost_defense ?? 0) / mc(e) / 5)),
        })),
        format: pct,
      },
      center: {
        title: 'Prolijidad Ofensiva',
        subtitle: 'Intercambios ganados limpiamente',
        entries: entries.map((e) => {
          const total = e.total_valid_exchanges ?? 0
          return { ...e, value: total > 0 ? (e.clean_exchanges_won ?? 0) / total : 0 }
        }),
        format: pct,
      },
      right: {
        title: 'Pulcritud',
        subtitle: 'Sin dobles ni contrapasos',
        entries: entries.map((e) => ({
          ...e,
          value: Math.max(0, 1 - ((e.double_hit_count ?? 0) + (e.contrapaso_count ?? 0)) / (e.total_valid_exchanges || 1)),
        })),
        format: pct,
      },
    },
    {
      left: {
        title: 'Puntos Recuperados',
        subtitle: 'Via contrapaso / asalto',
        entries: entries.map((e) => ({ ...e, value: (e.points_rescued_contrapaso ?? 0) / mc(e), total: e.points_rescued_contrapaso ?? 0 })),
        format: fmt,
        formatSecondary: (e) => `(${e.total}/${e.matches_complete ?? 1})`,
      },
      center: {
        title: 'Contrapasos',
        subtitle: 'Exitosos / asalto',
        entries: entries.map((e) => ({ ...e, value: (e.contrapaso_count ?? 0) / mc(e), total: e.contrapaso_count ?? 0 })),
        format: fmt,
        formatSecondary: (e) => `(${e.total}/${e.matches_complete ?? 1})`,
      },
      right: {
        title: 'Golpes Limpios',
        subtitle: 'Total promedio / asalto',
        entries: entries.map((e) => ({
          ...e,
          value: ((e.clean_hand_hits ?? 0) + (e.clean_body_hits ?? 0) + (e.clean_head_hits ?? 0)) / mc(e),
          total: (e.clean_hand_hits ?? 0) + (e.clean_body_hits ?? 0) + (e.clean_head_hits ?? 0),
        })),
        format: fmt,
        formatSecondary: (e) => `(${e.total}/${e.matches_complete ?? 1})`,
      },
    },
  ]
}

function BreakBanner({ eventStatus }) {
  const isBreak = eventStatus?.status === 'break'
  const breakEndsAt = eventStatus?.break_ends_at
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!breakEndsAt) { setRemaining(null); return }
    const tick = () => setRemaining(Math.max(0, breakEndsAt.toMillis() - Date.now()))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [breakEndsAt])

  if (!isBreak) return null

  const hasClock = breakEndsAt && remaining != null && remaining > 0
  const totalSec = hasClock ? Math.ceil(remaining / 1000) : 0
  const mm = Math.floor(totalSec / 60)
  const ss = String(totalSec % 60).padStart(2, '0')

  return (
    <div className={styles.breakBanner}>
      <span className={styles.breakIcon}>⏸</span>
      <span className={styles.breakText}>{hasClock ? 'Próxima ronda en' : 'Evento en pausa'}</span>
      {hasClock && <span className={styles.breakTimer}>{mm}:{ss}</span>}
    </div>
  )
}

export default function Display() {
  const { eventStatus, loading } = useEventStatus()
  const { leaderboard } = useLeaderboard()
  const { fightersMap } = useFighters()

  const isFinished = eventStatus?.status === 'finished'

  const MIN_MATCHES = 4
  const withMatches = useMemo(
    () => leaderboard
      .filter((e) => (e.matches_complete ?? 0) > 0)
      .map((e) => ({
        ...e,
        club: fightersMap[e.id]?.club ?? e.club,
        qualified: (e.matches_complete ?? 0) >= MIN_MATCHES,
      })),
    [leaderboard, fightersMap],
  )

  const statTriads = useMemo(() => buildTriads(withMatches), [withMatches])

  if (loading) return <div className={styles.loading}>Conectando…</div>

  return (
    <div className={styles.page}>
      {isFinished && (
        <div className={styles.finishedBanner}>Torneo finalizado — Hojas de Plata 2026</div>
      )}

      <Carousel paused={true}>
        <Leaderboard />
        {statTriads.map((triad, i) => (
          <PairedStats key={i} left={triad.left} center={triad.center} right={triad.right} />
        ))}
      </Carousel>

      <BreakBanner eventStatus={eventStatus} />
    </div>
  )
}
