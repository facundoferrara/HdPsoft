import { clubGradient } from '../../utils/clubColors'
import { useFighters } from '../../hooks/useFighters'
import styles from './ArenaStatus.module.css'

const ARENAS = [1, 2, 3]

export default function ArenaStatus({ matches = [] }) {
  const { fightersMap } = useFighters()

  const matchByArena = (arena) => matches.find((m) => m.arena === arena) ?? null

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Arenas</h3>
      <div className={styles.arenas}>
        {ARENAS.map((arena) => {
          const match = matchByArena(arena)
          const red = match ? fightersMap[match.fighter_red_id] : null
          const blue = match ? fightersMap[match.fighter_blue_id] : null
          return (
            <div key={arena} className={`${styles.arena} ${match ? styles.active : styles.idle}`}>
              <span className={styles.arenaLabel}>Arena {arena}</span>
              {match ? (
                <div className={styles.fighters}>
                  <div className={styles.fighter} style={{ background: clubGradient(red?.club) }}>
                    <span className={styles.red}>{red?.name ?? '—'}</span>
                    <span className={styles.club}>{red?.club}</span>
                  </div>
                  <span className={styles.vs}>vs</span>
                  <div className={styles.fighter} style={{ background: clubGradient(blue?.club) }}>
                    <span className={styles.blue}>{blue?.name ?? '—'}</span>
                    <span className={styles.club}>{blue?.club}</span>
                  </div>
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
