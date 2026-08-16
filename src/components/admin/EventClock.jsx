import { useState, useEffect, useMemo } from 'react'
import { useRounds } from '../../hooks/useRounds'
import styles from './EventClock.module.css'

const HARD_STOP_H = 18
const HARD_STOP_M = 45

function msUntilDeadline() {
  const now = new Date()
  const deadline = new Date(now)
  deadline.setHours(HARD_STOP_H, HARD_STOP_M, 0, 0)
  return deadline - now
}

export default function EventClock() {
  const { rounds } = useRounds()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])

  const completedRounds = useMemo(
    () => rounds
      .filter((r) => r.status === 'complete' && r.started_at && r.completed_at)
      .sort((a, b) => a.round_number - b.round_number),
    [rounds],
  )

  const avgMs = useMemo(() => {
    const last2 = completedRounds.slice(-2)
    if (last2.length === 0) return null
    const durations = last2.map((r) => r.completed_at.toMillis() - r.started_at.toMillis())
    return durations.reduce((a, b) => a + b, 0) / durations.length
  }, [completedRounds])

  const remaining = msUntilDeadline()
  const roundsFit = avgMs ? Math.floor(remaining / avgMs) : null
  const pastDeadline = remaining <= 0

  const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const avgMin = avgMs ? Math.round(avgMs / 60_000) : null

  let level = 'ok'
  if (pastDeadline || roundsFit === 0) level = 'critical'
  else if (roundsFit !== null && roundsFit <= 1) level = 'warn'

  return (
    <div className={styles.clock}>
      <span className={styles.time}>{timeStr}</span>
      <span className={styles.divider}>|</span>
      <span className={`${styles.estimate} ${styles[level]}`}>
        {pastDeadline ? (
          'Pasó el límite'
        ) : roundsFit !== null ? (
          <>
            ~{roundsFit} ronda{roundsFit !== 1 ? 's' : ''} <span className={styles.detail}>({avgMin}min/rda)</span>
          </>
        ) : (
          <span className={styles.detail}>Sin datos de ritmo</span>
        )}
      </span>
    </div>
  )
}
