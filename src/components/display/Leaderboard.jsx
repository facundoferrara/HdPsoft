import { useLeaderboard } from '../../hooks/useLeaderboard'
import styles from './Leaderboard.module.css'

export default function Leaderboard() {
  const { leaderboard, loading } = useLeaderboard(10)

  if (loading) return <div className={styles.loading}>Cargando…</div>

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Clasificación General</h2>
      <ol className={styles.list}>
        {leaderboard.map((entry, i) => (
          <li
            key={entry.id}
            className={styles.row}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span className={styles.rank}>{i + 1}</span>
            <div className={styles.info}>
              <span className={styles.name}>{entry.name}</span>
              <span className={styles.wld}>
                {entry.matches_won ?? 0}W {entry.matches_lost ?? 0}L {entry.matches_drawn ?? 0}D{(entry.bye_count ?? 0) > 0 ? ` ${entry.bye_count}C` : ''}
              </span>
            </div>
            <span className={styles.club}>{entry.club}</span>
            <span className={styles.points}>{entry.total_points.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
