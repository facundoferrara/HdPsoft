import { useDroppable } from '@dnd-kit/core'
import styles from './ArenaDropZone.module.css'

/**
 * Zona de drop para una arena. Muestra el asalto activo si lo hay.
 * @param {{ arena: number, activeMatch: object|null, fightersMap: object }} props
 */
export default function ArenaDropZone({ arena, activeMatch, fightersMap }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(arena) })

  const red = activeMatch ? fightersMap[activeMatch.fighter_red_id] : null
  const blue = activeMatch ? fightersMap[activeMatch.fighter_blue_id] : null

  return (
    <div
      ref={setNodeRef}
      className={`${styles.zone} ${activeMatch ? styles.occupied : styles.empty} ${isOver ? styles.over : ''}`}
    >
      <div className={styles.label}>Arena {arena}</div>
      {activeMatch ? (
        <div className={styles.matchInfo}>
          <span className={styles.tier}>{activeMatch.match_tier?.toUpperCase()}</span>
          <div className={styles.fighters}>
            <span className={styles.red}>{red?.name ?? '—'}</span>
            <span className={styles.vs}>vs</span>
            <span className={styles.blue}>{blue?.name ?? '—'}</span>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          {isOver ? 'Soltar aquí' : 'Libre'}
        </div>
      )}
    </div>
  )
}
