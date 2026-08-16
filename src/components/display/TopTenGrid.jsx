import { clubGradient, medalBorder } from '../../utils/clubColors'
import styles from './TopTenGrid.module.css'

function computeRanks(entries) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const rankMap = new Map()
  let denseRank = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || Math.abs(sorted[i].value - sorted[i - 1].value) > 0.001) denseRank++
    rankMap.set(sorted[i].id, denseRank)
  }
  return rankMap
}

export default function TopTenGrid({ top10, triad }) {
  const cols = [triad.left, triad.center, triad.right]
  const rankMaps = cols.map((col) => computeRanks(col.entries))

  const genRanks = computeRanks(top10.map((f) => ({ ...f, value: f.total_points ?? 0 })))

  const rows = top10.map((fighter, genIdx) => {
    const statRanks = cols.map((col, ci) => {
      const entry = col.entries.find((e) => e.id === fighter.id)
      return {
        rank: rankMaps[ci].get(fighter.id) ?? '–',
        value: entry ? col.format(entry.value) : '–',
        secondary: entry && col.formatSecondary ? col.formatSecondary(entry) : null,
      }
    })
    return { ...fighter, genRank: genRanks.get(fighter.id) ?? genIdx + 1, statRanks }
  })

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <span className={styles.hRank}>#</span>
        <span className={styles.hName}></span>
        <span className={styles.hPoints}>Pts</span>
        {cols.map((col, i) => (
          <span key={i} className={styles.hStat}>
            {col.title}
            {col.subtitle && <span className={styles.hStatSub}>{col.subtitle}</span>}
          </span>
        ))}
      </div>
      <ol className={styles.list}>
        {rows.map((f, i) => (
          <li
            key={f.id}
            className={styles.row}
            style={{ animationDelay: `${i * 0.06}s`, background: clubGradient(f.club), border: medalBorder(f.genRank - 1) }}
          >
            <span className={styles.rank}>{f.genRank}</span>
            <div className={styles.info}>
              <span className={`${styles.name} ${(f.matches_complete ?? 0) >= 4 ? styles.nameQualified : ''}`}>{f.name}</span>
              <span className={styles.wld}>
                <span className={styles.club}>{f.club}</span> · {f.matches_won ?? 0}W {f.matches_lost ?? 0}L {f.matches_drawn ?? 0}D{(f.bye_count ?? 0) > 0 ? ` ${f.bye_count}C` : ''}
              </span>
            </div>
            <span className={styles.points}>{(f.total_points ?? 0).toFixed(1)}</span>
            {f.statRanks.map((sr, ci) => (
              <span key={ci} className={styles.statCell}>
                <span className={styles.statRank}>{sr.rank}°</span>
                <span className={styles.statValue}>{sr.value}{sr.secondary && <span className={styles.statSecondary}> {sr.secondary}</span>}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </div>
  )
}
