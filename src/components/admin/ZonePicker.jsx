import styles from './ZonePicker.module.css'

const ZONES = [
  { id: 'head',  label: 'Cabeza',  sides: ['left', 'center', 'right'] },
  { id: 'body',  label: 'Cuerpo',  sides: ['left', 'center', 'right'] },
  { id: 'hand',  label: 'Mano',    sides: ['left', 'right'] },
  { id: 'presa', label: 'Presa',   sides: ['center'] },
]

/**
 * Selector de zona + lado para intercambios.
 * @param {{ value, onChange, label }} props
 *   value: { zone, side } | null
 *   onChange: ({ zone, side }) => void
 */
export default function ZonePicker({ value, onChange, label }) {
  const selectedZone = ZONES.find((z) => z.id === value?.zone)

  function pickZone(zoneId) {
    const z = ZONES.find((z) => z.id === zoneId)
    // Auto-select center if only one side option
    if (z.sides.length === 1) {
      onChange({ zone: zoneId, side: z.sides[0] })
    } else {
      onChange({ zone: zoneId, side: null })
    }
  }

  function pickSide(side) {
    onChange({ zone: value.zone, side })
  }

  return (
    <div className={styles.container}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.zones}>
        {ZONES.map((z) => (
          <button
            key={z.id}
            type="button"
            className={`${styles.zone} ${value?.zone === z.id ? styles.selected : ''}`}
            onClick={() => pickZone(z.id)}
          >
            {z.label}
          </button>
        ))}
      </div>
      {selectedZone && selectedZone.sides.length > 1 && (
        <div className={styles.sides}>
          {selectedZone.sides.map((side) => (
            <button
              key={side}
              type="button"
              className={`${styles.side} ${value?.side === side ? styles.selected : ''}`}
              onClick={() => pickSide(side)}
            >
              {side === 'left' ? 'Izq.' : side === 'right' ? 'Der.' : 'Centro'}
            </button>
          ))}
        </div>
      )}
      {value?.zone && value?.side && (
        <div className={styles.summary}>
          {ZONES.find((z) => z.id === value.zone)?.label} ·{' '}
          {value.side === 'left' ? 'Izquierda' : value.side === 'right' ? 'Derecha' : 'Centro'}
        </div>
      )}
    </div>
  )
}
