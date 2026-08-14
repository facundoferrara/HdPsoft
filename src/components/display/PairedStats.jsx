import styles from './PairedStats.module.css'

function assignRanks(sorted) {
  const ranked = []
  let denseRank = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i].value !== sorted[i - 1].value) denseRank++
    ranked.push({ ...sorted[i], rank: denseRank })
  }
  return ranked
}

function StatColumn({ title, subtitle, entries, formatValue, sortAsc, formatSecondary }) {
  const cmp = sortAsc ? (a, b) => a.value - b.value : (a, b) => b.value - a.value
  const sorted = [...entries].sort(cmp)
  const top = sorted.slice(0, 15)
  const ranked = assignRanks(top)

  return (
    <div className={styles.column}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <ol className={styles.list}>
        {ranked.map((entry, i) => (
          <li
            key={entry.id}
            className={`${styles.row} ${!entry.qualified ? styles.unqualified : ''}`}
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <span className={styles.rank}>{entry.rank}</span>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.value}>
              {formatValue(entry.value)}
              {formatSecondary && (
                <span className={styles.secondary}>{formatSecondary(entry)}</span>
              )}
            </span>
          </li>
        ))}
        {top.length === 0 && (
          <li className={styles.empty}>Sin datos aún</li>
        )}
      </ol>
    </div>
  )
}

export default function PairedStats({ left, center, right }) {
  return (
    <div className={styles.paired}>
      <StatColumn
        title={left.title} subtitle={left.subtitle} entries={left.entries} formatValue={left.format}
        sortAsc={left.sortAsc} formatSecondary={left.formatSecondary}
      />
      <div className={styles.divider} />
      {center && (
        <>
          <StatColumn
            title={center.title} subtitle={center.subtitle} entries={center.entries} formatValue={center.format}
            sortAsc={center.sortAsc} formatSecondary={center.formatSecondary}
          />
          <div className={styles.divider} />
        </>
      )}
      <StatColumn
        title={right.title} subtitle={right.subtitle} entries={right.entries} formatValue={right.format}
        sortAsc={right.sortAsc} formatSecondary={right.formatSecondary}
      />
    </div>
  )
}
