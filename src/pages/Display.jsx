import ArenaStatus from '../components/display/ArenaStatus'
import Leaderboard from '../components/display/Leaderboard'
import BreakCountdown from '../components/display/BreakCountdown'
import { useEventStatus } from '../hooks/useEventStatus'
import styles from './Display.module.css'

export default function Display() {
  const { eventStatus, loading } = useEventStatus()

  if (loading) return <div className={styles.loading}>Conectando…</div>

  const isBreak = eventStatus?.status === 'break'
  const isFinished = eventStatus?.status === 'finished'

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

      <div className={styles.columns}>
        <section className={styles.left}>
          <ArenaStatus />
        </section>
        <section className={styles.right}>
          <Leaderboard />
        </section>
      </div>
    </div>
  )
}
