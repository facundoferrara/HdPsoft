import { useMemo } from 'react'
import { useCutting } from '../hooks/useCutting'
import { useFighters } from '../hooks/useFighters'
import { clubGradient, medalBorder } from '../utils/clubColors'
import styles from './Corte.module.css'

function assignRanks(entries) {
  const ranks = []
  const medalGroups = []
  let denseRank = 0
  let group = 0
  for (let i = 0; i < entries.length; i++) {
    const scored = entries[i].final_score != null
    const prev = entries[i - 1]
    if (i === 0 || !scored || entries[i].final_score !== prev?.final_score) {
      denseRank++
      group++
    }
    ranks.push(scored ? denseRank : '—')
    medalGroups.push(group)
  }
  return { ranks, medalGroups }
}

function Row({ p, rank, medalGroup }) {
  const club = p.club
  return (
    <li
      className={`${styles.row} ${p.final_score == null ? styles.unscored : ''}`}
      style={{ background: clubGradient(club), border: medalBorder(medalGroup - 1) }}
    >
      <span className={styles.rank}>{rank}</span>
      <div className={styles.info}>
        <span className={styles.name}>{p.name}</span>
        <span className={styles.meta}>
          <span className={styles.club}>{club}</span>
          {p.weapon && <span className={styles.weapon}> · {p.weapon}</span>}
        </span>
      </div>
      <span className={styles.score}>{p.final_score ?? '—'}</span>
    </li>
  )
}

export default function Corte() {
  const { participants, loading } = useCutting()
  const { fightersMap } = useFighters()

  const sorted = useMemo(() => {
    const enriched = participants.map((p) => ({
      ...p,
      club: fightersMap[p.id]?.club ?? p.club,
    }))
    const scored = enriched.filter((p) => p.final_score != null).sort((a, b) => b.final_score - a.final_score)
    const unscored = enriched.filter((p) => p.final_score == null)
    return [...scored, ...unscored]
  }, [participants, fightersMap])

  const { ranks, medalGroups } = useMemo(() => assignRanks(sorted), [sorted])

  if (loading) return <div className={styles.loading}>Conectando...</div>

  const half = Math.ceil(sorted.length / 2)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Torneo de Corte</h1>

      {sorted.length === 0 ? (
        <p className={styles.empty}>Aun no hay puntajes cargados.</p>
      ) : (
        <div className={styles.cols}>
          <ol className={styles.list}>
            {sorted.slice(0, half).map((p, i) => (
              <Row key={p.id} p={p} rank={ranks[i]} medalGroup={medalGroups[i]} />
            ))}
          </ol>
          <ol className={styles.list}>
            {sorted.slice(half).map((p, i) => (
              <Row key={p.id} p={p} rank={ranks[half + i]} medalGroup={medalGroups[half + i]} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
