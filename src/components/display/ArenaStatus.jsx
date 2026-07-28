import { useState, useEffect } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { matchesRef } from '../../firebase/db'
import { useFighters } from '../../hooks/useFighters'
import styles from './ArenaStatus.module.css'

const ARENAS = [1, 2, 3, 4]

export default function ArenaStatus() {
  const [activeMatches, setActiveMatches] = useState([])
  const { fightersMap } = useFighters()

  useEffect(() => {
    const q = query(matchesRef, where('status', '==', 'active'))
    const unsub = onSnapshot(q, (snap) => {
      setActiveMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  const matchByArena = (arena) => activeMatches.find((m) => m.arena === arena) ?? null

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Arenas</h2>
      <div className={styles.arenas}>
        {ARENAS.map((arena) => {
          const match = matchByArena(arena)
          const red = match ? fightersMap[match.fighter_red_id] : null
          const blue = match ? fightersMap[match.fighter_blue_id] : null
          const referee = match ? fightersMap[match.referee_id] : null
          return (
            <div key={arena} className={`${styles.arena} ${match ? styles.active : styles.idle}`}>
              <span className={styles.arenaLabel}>Arena {arena}</span>
              {match ? (
                <div className={styles.matchInfo}>
                  <span className={styles.tier}>{match.match_tier?.toUpperCase()}</span>
                  <div className={styles.fighters}>
                    <span className={styles.red}>{red?.name ?? '—'}</span>
                    <span className={styles.vs}>vs</span>
                    <span className={styles.blue}>{blue?.name ?? '—'}</span>
                  </div>
                  {referee && (
                    <div className={styles.referee}>Árb: {referee.name}</div>
                  )}
                </div>
              ) : (
                <span className={styles.idleLabel}>Libre</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
