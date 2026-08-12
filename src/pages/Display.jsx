import { useState, useEffect, useMemo } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { matchesRef } from '../firebase/db'
import ArenaStatus from '../components/display/ArenaStatus'
import Leaderboard from '../components/display/Leaderboard'
import BreakCountdown from '../components/display/BreakCountdown'
import Carousel from '../components/display/Carousel'
import PairedStats from '../components/display/PairedStats'
import { useEventStatus } from '../hooks/useEventStatus'
import { useLeaderboard } from '../hooks/useLeaderboard'
import styles from './Display.module.css'

const fmt = (v) => v.toFixed(2)

export default function Display() {
  const { eventStatus, loading } = useEventStatus()
  const { leaderboard } = useLeaderboard()

  const [activeMatches, setActiveMatches] = useState([])
  useEffect(() => {
    const q = query(matchesRef, where('status', '==', 'active'))
    return onSnapshot(q, (snap) => {
      setActiveMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const isBreak = eventStatus?.status === 'break'
  const isFinished = eventStatus?.status === 'finished'
  const hasActiveArenas = activeMatches.some((m) => m.arena != null)
  const showArenas = hasActiveArenas && !isBreak

  const withMatches = useMemo(
    () => leaderboard.filter((e) => (e.matches_complete ?? 0) > 0),
    [leaderboard],
  )

  const statPairs = useMemo(() => {
    const mc = (e) => e.matches_complete ?? 1

    return [
      {
        left: {
          title: 'Golpes a las Manos',
          subtitle: 'Promedio por asalto',
          entries: withMatches.map((e) => ({ ...e, value: (e.hand_hits_landed ?? 0) / mc(e) })),
          format: fmt,
        },
        right: {
          title: 'Golpes a la Cabeza',
          subtitle: 'Golpes limpios promedio por asalto',
          entries: withMatches.map((e) => ({ ...e, value: (e.clean_head_hits ?? 0) / mc(e) })),
          format: fmt,
        },
      },
      {
        left: {
          title: 'Pericia Defensiva',
          subtitle: 'Promedio de puntos iniciales defendidos',
          entries: withMatches.map((e) => ({
            ...e,
            value: Math.max(0, Math.min(5, 5 - (e.points_lost_defense ?? 0) / mc(e))),
          })),
          format: fmt,
        },
        right: {
          title: 'Prolijidad Ofensiva',
          subtitle: 'Proporción de intercambios sin dobles',
          entries: withMatches.map((e) => {
            const doubles = (e.double_hit_count ?? 0) / mc(e)
            return { ...e, value: Math.max(0, 1 - doubles / 3) }
          }),
          format: (v) => `${Math.round(v * 100)}%`,
        },
      },
      {
        left: {
          title: 'Puntos Rescatados',
          subtitle: 'Puntos recuperados por contrapaso / asalto',
          entries: withMatches.map((e) => ({ ...e, value: (e.points_rescued_contrapaso ?? 0) / mc(e) })),
          format: fmt,
        },
        right: {
          title: 'Contrapasos',
          subtitle: 'Ejecuciones promedio por asalto',
          entries: withMatches.map((e) => ({ ...e, value: (e.contrapaso_count ?? 0) / mc(e) })),
          format: fmt,
        },
      },
    ]
  }, [withMatches])

  if (loading) return <div className={styles.loading}>Conectando…</div>

  return (
    <div className={styles.page}>
      {isBreak && (
        <div className={styles.breakOverlay}>
          <BreakCountdown breakEndsAt={eventStatus.break_ends_at} />
        </div>
      )}

      {isFinished && (
        <div className={styles.finishedBanner}>Torneo finalizado</div>
      )}

      {showArenas && (
        <div className={styles.arenaBanner}>
          <ArenaStatus matches={activeMatches} />
        </div>
      )}

      <div className={styles.columns} style={showArenas ? { height: 'calc(100vh - 6vh)' } : undefined}>
        <section className={styles.left}>
          <Leaderboard />
        </section>
        <section className={styles.right}>
          <Carousel intervalMs={15000}>
            {statPairs.map((pair, i) => (
              <PairedStats key={i} left={pair.left} right={pair.right} />
            ))}
          </Carousel>
        </section>
      </div>
    </div>
  )
}
