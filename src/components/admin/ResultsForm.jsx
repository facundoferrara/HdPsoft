import { useState } from 'react'
import { useRoundMatches } from '../../hooks/useMatches'
import { useRounds } from '../../hooks/useRounds'
import { useFighters } from '../../hooks/useFighters'
import MatchScoresheet from './MatchScoresheet'
import styles from './ResultsForm.module.css'

export default function ResultsForm() {
  const { currentRound }  = useRounds()
  const { matches }       = useRoundMatches(currentRound?.id)
  const { fightersMap }   = useFighters()

  const [selectedMatchId, setSelectedMatchId] = useState(null)

  const activeMatches = matches.filter((m) => m.status === 'active')

  if (!currentRound)         return <div className={styles.empty}>No hay ronda activa.</div>
  if (!activeMatches.length) return <div className={styles.empty}>No hay asaltos activos en este momento.</div>

  if (!selectedMatchId) return (
    <div className={styles.page}>
      <h3 className={styles.sectionTitle}>Seleccionar asalto</h3>
      <div className={styles.matchList}>
        {activeMatches.map((m) => {
          const r = fightersMap[m.fighter_red_id], b = fightersMap[m.fighter_blue_id]
          return (
            <button key={m.id} className={styles.matchOption} onClick={() => setSelectedMatchId(m.id)}>
              <span className={styles.arena}>#{m.match_number} · Arena {m.arena}</span>
              <span className={styles.redName}>{r?.name ?? '—'}</span>
              <span className={styles.vs}>vs</span>
              <span className={styles.blueName}>{b?.name ?? '—'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  return <MatchScoresheet key={selectedMatchId} matchId={selectedMatchId} onBack={() => setSelectedMatchId(null)} />
}
