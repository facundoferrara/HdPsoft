import { useLeaderboard } from '../../hooks/useLeaderboard'
import { clubGradient, medalBorder } from '../../utils/clubColors'
import styles from './Leaderboard.module.css'

function assignRanks(entries) {
  const ranks = []
  const medalGroups = []
  let denseRank = 0
  let group = 0
  for (let i = 0; i < entries.length; i++) {
    if (i === 0 || Math.abs(entries[i].total_points - entries[i - 1].total_points) > 0.001) {
      denseRank++
      group++
    }
    ranks.push(denseRank)
    medalGroups.push(group)
  }
  return { ranks, medalGroups }
}

export default function Leaderboard() {
  const { leaderboard, loading } = useLeaderboard(10)

  if (loading) return <div className={styles.loading}>Cargando…</div>

  const { ranks, medalGroups } = assignRanks(leaderboard)

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Clasificación General</h2>
      <ol className={styles.list}>
        {leaderboard.map((entry, i) => (
          <li
            key={entry.id}
            className={styles.row}
            style={{ animationDelay: `${i * 0.1}s`, background: clubGradient(entry.club), border: medalBorder(medalGroups[i] - 1) }}
          >
            <span className={styles.rank}>{ranks[i]}</span>
            <div className={styles.info}>
              <span className={`${styles.name} ${(entry.matches_complete ?? 0) >= 4 ? styles.nameQualified : ''}`}>{entry.name}</span>
              <span className={styles.wld}>
                <span className={styles.club}>{entry.club}</span> · {entry.matches_won ?? 0}W {entry.matches_lost ?? 0}L {entry.matches_drawn ?? 0}D{(entry.bye_count ?? 0) > 0 ? ` ${entry.bye_count}C` : ''}
              </span>
            </div>
            <span className={styles.points}>{entry.total_points.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
