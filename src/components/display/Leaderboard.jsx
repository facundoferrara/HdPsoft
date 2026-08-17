import { useMemo } from 'react'
import { useLeaderboard } from '../../hooks/useLeaderboard'
import { useFighters } from '../../hooks/useFighters'
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

function Row({ entry, rank, medalGroup }) {
  return (
    <li
      className={styles.row}
      style={{ background: clubGradient(entry.club), border: medalBorder(medalGroup - 1) }}
    >
      <span className={styles.rank}>{rank}</span>
      <div className={styles.info}>
        <span className={`${styles.name} ${(entry.matches_complete ?? 0) >= 4 ? styles.nameQualified : ''}`}>{entry.name}</span>
        <span className={styles.wld}>
          <span className={styles.club}>{entry.club}</span>
          {' · '}{entry.matches_won ?? 0}V {entry.matches_lost ?? 0}D {entry.matches_drawn ?? 0}E
          {(entry.bye_count ?? 0) > 0 ? ` ${entry.bye_count}C` : ''}
        </span>
      </div>
      <span className={styles.points}>{entry.total_points.toFixed(1)}</span>
    </li>
  )
}

export default function Leaderboard() {
  const { leaderboard, loading } = useLeaderboard()
  const { fightersMap } = useFighters()

  const entries = useMemo(
    () => leaderboard.map((e) => ({ ...e, club: fightersMap[e.id]?.club ?? e.club })),
    [leaderboard, fightersMap],
  )

  if (loading) return <div className={styles.loading}>Cargando…</div>

  const { ranks, medalGroups } = assignRanks(entries)
  const half = Math.ceil(entries.length / 2)

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Clasificación General</h2>
      <div className={styles.cols}>
        <ol className={styles.list}>
          {entries.slice(0, half).map((entry, i) => (
            <Row key={entry.id} entry={entry} rank={ranks[i]} medalGroup={medalGroups[i]} />
          ))}
        </ol>
        <ol className={styles.list}>
          {entries.slice(half).map((entry, i) => (
            <Row key={entry.id} entry={entry} rank={ranks[half + i]} medalGroup={medalGroups[half + i]} />
          ))}
        </ol>
      </div>
    </div>
  )
}
