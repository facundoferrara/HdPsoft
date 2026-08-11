import { useDroppable } from '@dnd-kit/core'
import styles from './ArenaDropZone.module.css'

/**
 * Zona de drop para una arena. Muestra el asalto activo si lo hay.
 * @param {{ arena: number, activeMatch: object|null, fightersMap: object }} props
 */
export default function ArenaDropZone({ arena, activeMatch, fightersMap, onSelect, onDeactivate }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(arena), disabled: !!activeMatch })

  const red = activeMatch ? fightersMap[activeMatch.fighter_red_id] : null
  const blue = activeMatch ? fightersMap[activeMatch.fighter_blue_id] : null
  const referee = activeMatch ? fightersMap[activeMatch.referee_id] : null
  const judge1 = activeMatch ? fightersMap[activeMatch.judge_1_id] : null
  const judge2 = activeMatch ? fightersMap[activeMatch.judge_2_id] : null

  return (
    <div
      ref={setNodeRef}
      className={`${styles.zone} ${activeMatch ? styles.occupied : styles.empty} ${isOver ? styles.over : ''} ${activeMatch ? styles.clickable : ''}`}
      onClick={() => activeMatch && onSelect?.(activeMatch.id)}
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
          <div className={styles.control}>
            Árb: {referee?.name ?? '—'} · Jueces: {judge1?.name ?? '—'} / {judge2?.name ?? '—'}
          </div>
          <button
            type="button"
            className={styles.deactivateBtn}
            onClick={(e) => { e.stopPropagation(); onDeactivate?.(activeMatch.id) }}
          >
            ✕ Liberar arena
          </button>
        </div>
      ) : (
        <div className={styles.placeholder}>
          {isOver ? 'Soltar aquí' : 'Libre'}
        </div>
      )}
    </div>
  )
}
