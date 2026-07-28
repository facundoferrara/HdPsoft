import { useLeaderboard } from '../../hooks/useLeaderboard'
import styles from './Leaderboard.module.css'

/** Top 10 del leaderboard para la vista /display */
export default function Leaderboard() {
  const { leaderboard, loading } = useLeaderboard(10)

  if (loading) return <div className={styles.loading}>Cargando…</div>

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Clasificación</h2>
      <ol className={styles.list}>
        {leaderboard.map((entry, i) => (
          <li key={entry.id} className={styles.row}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.club}>{entry.club}</span>
            <span className={styles.points}>{entry.total_points.toFixed(2)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
