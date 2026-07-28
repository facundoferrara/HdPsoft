import { useRounds } from '../../hooks/useRounds'
import { useEventStatus } from '../../hooks/useEventStatus'
import styles from './RoundProjection.module.css'

export default function RoundProjection() {
  const { rounds } = useRounds()
  const { eventStatus } = useEventStatus()

  const completedRounds = rounds.filter(
    (r) => r.status === 'complete' && r.started_at && r.completed_at
  )

  if (completedRounds.length < 1) return null

  const durations = completedRounds.map((r) => {
    const start = r.started_at.toMillis()
    const end = r.completed_at.toMillis()
    return Math.round((end - start) / 60000)
  })

  const avgRound = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  const lastPause = 10
  const cycleMin = avgRound + lastPause

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [th, tm] = (eventStatus?.target_end_time ?? '18:00').split(':').map(Number)
  const targetMin = th * 60 + tm
  const remaining = targetMin - nowMin
  const possibleRounds = remaining > 0 ? Math.floor(remaining / cycleMin) : 0

  return (
    <div className={styles.container}>
      <div className={styles.item}>
        <span className={styles.label}>Prom. ronda</span>
        <span className={styles.value}>{avgRound} min</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Ciclo (ronda+pausa)</span>
        <span className={styles.value}>{cycleMin} min</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Rondas posibles</span>
        <span className={`${styles.value} ${possibleRounds <= 1 ? styles.warn : ''}`}>
          {possibleRounds}
        </span>
      </div>
    </div>
  )
}