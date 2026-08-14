import styles from './TopTenGrid.module.css'

function computeRanks(entries) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const rankMap = new Map()
  let denseRank = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i].value !== sorted[i - 1].value) denseRank++
    rankMap.set(sorted[i].id, denseRank)
  }
  return rankMap
}

export default function TopTenGrid({ top10, triad }) {
  const cols = [triad.left, triad.center, triad.right]
  const rankMaps = cols.map((col) => computeRanks(col.entries))

  const rows = top10.map((fighter, genIdx) => {
    const statRanks = cols.map((col, ci) => {
      const entry = col.entries.find((e) => e.id === fighter.id)
      return {
        rank: rankMaps[ci].get(fighter.id) ?? '–',
        value: entry ? col.format(entry.value) : '–',
      }
    })
    return { ...fighter, genRank: genIdx + 1, statRanks }
  })

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <span className={styles.hRank}>#</span>
        <span className={styles.hName}></span>
        <span className={styles.hPoints}>Pts</span>
        {cols.map((col, i) => (
          <span key={i} className={styles.hStat}>{col.title}</span>
        ))}
      </div>
      <ol className={styles.list}>
        {rows.map((f, i) => (
          <li
            key={f.id}
            className={styles.row}
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <span className={styles.rank}>{f.genRank}</span>
            <div className={styles.info}>
              <span className={styles.name}>{f.name}</span>
              <span className={styles.wld}>
                {f.matches_won ?? 0}W {f.matches_lost ?? 0}L {f.matches_drawn ?? 0}D{(f.bye_count ?? 0) > 0 ? ` ${f.bye_count}C` : ''}
              </span>
            </div>
            <span className={styles.points}>{(f.total_points ?? 0).toFixed(1)}</span>
            {f.statRanks.map((sr, ci) => (
              <span key={ci} className={styles.statCell}>
                <span className={styles.statRank}>{sr.rank}°</span>
                <span className={styles.statValue}>{sr.value}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </div>
  )
}
