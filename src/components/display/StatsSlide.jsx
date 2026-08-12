import styles from './StatsSlide.module.css'

export default function StatsSlide({ title, subtitle, entries, formatValue }) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 10)

  return (
    <div className={styles.slide}>
      <h2 className={styles.title}>{title}</h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <ol className={styles.list}>
        {top.map((entry, i) => (
          <li
            key={entry.id}
            className={styles.row}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.club}>{entry.club}</span>
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
