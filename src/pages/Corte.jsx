import { useMemo } from 'react'
import { useCutting } from '../hooks/useCutting'
import { clubGradient, medalBorder } from '../utils/clubColors'
import styles from './Corte.module.css'

function assignRanks(entries) {
  const ranks = []
  const medalGroups = []
  let denseRank = 0
  let group = 0
  for (let i = 0; i < entries.length; i++) {
    if (i === 0 || entries[i].final_score !== entries[i - 1].final_score) {
      denseRank++
      group++
    }
    ranks.push(denseRank)
    medalGroups.push(group)
  }
  return { ranks, medalGroups }
}

export default function Corte() {
  const { participants, loading } = useCutting()

  const ranked = useMemo(() => {
    return [...participants]
      .filter((p) => p.final_score != null)
      .sort((a, b) => b.final_score - a.final_score)
  }, [participants])

  const { ranks, medalGroups } = useMemo(() => assignRanks(ranked), [ranked])

  if (loading) return <div className={styles.loading}>Conectando...</div>

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Torneo de Corte</h1>

      {ranked.length === 0 ? (
        <p className={styles.empty}>Aun no hay puntajes cargados.</p>
      ) : (
        <ol className={styles.list}>
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={styles.row}
              style={{
                animationDelay: `${i * 0.1}s`,
                background: clubGradient(p.club),
                border: medalBorder(medalGroups[i] - 1),
              }}
            >
              <span className={styles.rank}>{ranks[i]}</span>
              <div className={styles.info}>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.meta}>
                  <span className={styles.club}>{p.club}</span>
                  {p.weapon && <span className={styles.weapon}> · {p.weapon}</span>}
                </span>
              </div>
              <span className={styles.score}>{p.final_score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
