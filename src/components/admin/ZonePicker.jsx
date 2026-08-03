import styles from './ZonePicker.module.css'

const ZONES = [
  { id: 'head',  label: 'Cabeza' },
  { id: 'body',  label: 'Cuerpo' },
  { id: 'hand',  label: 'Mano'   },
  { id: 'presa', label: 'Presa'  },
]

/**
 * Selector de zona para intercambios.
 * @param {{ value, onChange, label }} props
 *   value: { zone } | null
 *   onChange: ({ zone }) => void
 */
export default function ZonePicker({ value, onChange, label }) {
  return (
    <div className={styles.container}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.zones}>
        {ZONES.map((z) => (
          <button
            key={z.id}
            type="button"
            className={`${styles.zone} ${value?.zone === z.id ? styles.selected : ''}`}
            onClick={() => onChange({ zone: z.id })}
          >
            {z.label}
          </button>
        ))}
      </div>
      {value?.zone && (
        <div className={styles.summary}>
          {ZONES.find((z) => z.id === value.zone)?.label}
        </div>
      )}
    </div>
  )
}
