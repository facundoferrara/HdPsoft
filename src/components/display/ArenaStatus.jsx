import { useState, useEffect } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { matchesRef } from '../../firebase/db'
import styles from './ArenaStatus.module.css'

const ARENAS = [1, 2, 3, 4]

/** Columna izquierda del /display: estado de las 4 arenas en tiempo real */
export default function ArenaStatus() {
  const [activeMatches, setActiveMatches] = useState([])

  useEffect(() => {
    const q = query(matchesRef, where('status', '==', 'active'))
    const unsub = onSnapshot(q, (snap) => {
      setActiveMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  const matchByArena = (arena) =>
    activeMatches.find((m) => m.arena === arena) ?? null

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Arenas</h2>
      <div className={styles.arenas}>
        {ARENAS.map((arena) => {
          const match = matchByArena(arena)
          return (
            <div
              key={arena}
              className={`${styles.arena} ${match ? styles.active : styles.idle}`}
            >
              <span className={styles.arenaLabel}>Arena {arena}</span>
              {match ? (
                <div className={styles.matchInfo}>
                  <span className={styles.tier}>{match.match_tier.toUpperCase()}</span>
                  <div className={styles.fighters}>
                    <span className={styles.red}>{match.fighter_red_id}</span>
                    <span className={styles.vs}>vs</span>
                    <span className={styles.blue}>{match.fighter_blue_id}</span>
                  </div>
                </div>
              ) : (
                <span className={styles.idle}>Libre</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
