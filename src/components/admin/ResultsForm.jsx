import { useState, useRef } from 'react'
import { useRoundMatches } from '../../hooks/useMatches'
import { useRounds } from '../../hooks/useRounds'
import { useFighters } from '../../hooks/useFighters'
import MatchScoresheet from './MatchScoresheet'
import styles from './ResultsForm.module.css'

const TIER_COLOR = { boffer: '#42a5f5', nylon: '#ab47bc', acero: '#81c784' }

export default function ResultsForm() {
  const { rounds, currentRound } = useRounds()
  const { fightersMap }          = useFighters()

  const [viewRoundId, setViewRoundId] = useState(null)
  const lastRoundId = rounds.length > 0 ? rounds[rounds.length - 1].id : null
  const roundId = viewRoundId ?? currentRound?.id ?? lastRoundId
  const { matches } = useRoundMatches(roundId)

  const [selectedMatchId, setSelectedMatchId] = useState(null)
  const blocksCache = useRef({})

  const viewRound = rounds.find((r) => r.id === roundId)

  const activeMatches   = matches.filter((m) => m.status === 'active')
  const completeMatches = matches.filter((m) => m.status === 'complete')
  const pendingMatches  = matches.filter((m) => m.status === 'pending')
  const sortedMatches   = [...activeMatches, ...pendingMatches, ...completeMatches]

  if (!rounds.length) return <div className={styles.empty}>No hay rondas.</div>

  function selectRound(id) {
    setViewRoundId(id)
    setSelectedMatchId(null)
  }

  return (
    <div className={styles.splitLayout}>
      {/* Sidebar — 33% */}
      <aside className={styles.sidebar}>
        <div className={styles.roundTabs}>
          {rounds.map((r) => (
            <button
              key={r.id}
              className={`${styles.roundTab} ${r.id === roundId ? styles.roundTabActive : ''} ${r.status === 'complete' ? styles.roundTabComplete : ''}`}
              onClick={() => selectRound(r.id)}
            >
              R{r.round_number}
            </button>
          ))}
        </div>

        <div className={styles.sidebarTitle}>
          Ronda {viewRound?.round_number ?? '—'}
          {viewRound?.status === 'complete' && <span className={styles.roundDone}> (cerrada)</span>}
        </div>

        <div className={styles.sidebarList}>
          {[...activeMatches, ...pendingMatches].map((m) => {
            const r = fightersMap[m.fighter_red_id]
            const b = fightersMap[m.fighter_blue_id]
            const isActive = m.status === 'active'
            const isSelected = m.id === selectedMatchId
            const cardClass = [
              styles.matchCard,
              isActive ? styles.matchCardActive : '',
              isSelected ? styles.matchCardSelected : '',
              m.status === 'pending' ? styles.matchCardPending : '',
            ].filter(Boolean).join(' ')
            return (
              <button key={m.id} className={cardClass} onClick={() => setSelectedMatchId(m.id)}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardNum}>{m.match_number != null ? `#${m.match_number}` : '—'}</span>
                  <span className={styles.cardTier} style={{ color: TIER_COLOR[m.match_tier] }}>
                    {m.match_tier?.toUpperCase()}
                  </span>
                  {isActive && <span className={styles.cardLive}>En curso</span>}
                </div>
                <div className={styles.cardFighters}>
                  <div className={styles.cardFighterSide}>
                    <span className={styles.dotRed}>●</span>
                    <span className={styles.cardName}>{r?.name ?? '—'}</span>
                  </div>
                  <span className={styles.cardVs}>vs</span>
                  <div className={styles.cardFighterSide}>
                    <span className={styles.cardName}>{b?.name ?? '—'}</span>
                    <span className={styles.dotBlue}>●</span>
                  </div>
                </div>
              </button>
            )
          })}
          {completeMatches.length > 0 && (
            <>
              <div className={styles.sidebarSeparator}>Finalizados</div>
              {completeMatches.map((m) => {
                const r = fightersMap[m.fighter_red_id]
                const b = fightersMap[m.fighter_blue_id]
                const isSelected = m.id === selectedMatchId
                const cardClass = [
                  styles.matchCard,
                  styles.matchCardComplete,
                  isSelected ? styles.matchCardSelected : '',
                ].filter(Boolean).join(' ')
                return (
                  <button key={m.id} className={cardClass} onClick={() => setSelectedMatchId(m.id)}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardNum}>{m.match_number != null ? `#${m.match_number}` : '—'}</span>
                      <span className={styles.cardTier} style={{ color: TIER_COLOR[m.match_tier] }}>
                        {m.match_tier?.toUpperCase()}
                      </span>
                      {m.final_score_red != null && (
                        <span className={styles.cardScore}>{m.final_score_red}–{m.final_score_blue}</span>
                      )}
                    </div>
                    <div className={styles.cardFighters}>
                      <div className={styles.cardFighterSide}>
                        <span className={styles.dotRed}>●</span>
                        <span className={styles.cardName}>{r?.name ?? '—'}</span>
                      </div>
                      <span className={styles.cardVs}>vs</span>
                      <div className={styles.cardFighterSide}>
                        <span className={styles.cardName}>{b?.name ?? '—'}</span>
                        <span className={styles.dotBlue}>●</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </>
          )}
          {!sortedMatches.length && <div className={styles.empty}>Sin asaltos en esta ronda.</div>}
        </div>
      </aside>

      {/* Main — 67% */}
      <main className={styles.mainPanel}>
        {selectedMatchId ? (
          <MatchScoresheet
            key={selectedMatchId}
            matchId={selectedMatchId}
            roundId={roundId}
            initialBlocks={blocksCache.current[selectedMatchId]}
            onBlocksChange={(blocks) => { blocksCache.current[selectedMatchId] = blocks }}
            onBack={() => setSelectedMatchId(null)}
          />
        ) : (
          <div className={styles.mainEmpty}>
            Seleccionar un asalto de la lista para cargar o editar resultados.
          </div>
        )}
      </main>
    </div>
  )
}
