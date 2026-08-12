import styles from './PairedStats.module.css'

function StatColumn({ title, subtitle, entries, formatValue }) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 10)

  return (
    <div className={styles.column}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <ol className={styles.list}>
        {top.map((entry, i) => (
          <li
            key={entry.id}
            className={styles.row}
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.value}>{formatValue(entry.value)}</span>
          </li>
        ))}
        {top.length === 0 && (
          <li className={styles.empty}>Sin datos aún</li>
        )}
      </ol>
    </div>
  )
}

export default function PairedStats({ left, right }) {
  return (
    <div className={styles.paired}>
      <StatColumn title={left.title} subtitle={left.subtitle} entries={left.entries} formatValue={left.format} />
      <div className={styles.divider} />
      <StatColumn title={right.title} subtitle={right.subtitle} entries={right.entries} formatValue={right.format} />
    </div>
  )
}
