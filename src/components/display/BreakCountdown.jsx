import { useState, useEffect } from 'react'
import styles from './BreakCountdown.module.css'

/**
 * Countdown visible en /display durante el descanso.
 * Si break_ends_at es null muestra "Pausa" sin timer.
 *
 * @param {{ breakEndsAt: import('firebase/firestore').Timestamp | null }} props
 */
export default function BreakCountdown({ breakEndsAt }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!breakEndsAt) {
      setRemaining(null)
      return
    }

    const tick = () => {
      const diff = breakEndsAt.toMillis() - Date.now()
      setRemaining(Math.max(0, diff))
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [breakEndsAt])

  if (!breakEndsAt) {
    return <div className={styles.pause}>⏸ Pausa</div>
  }

  const totalSec = Math.ceil((remaining ?? 0) / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = String(totalSec % 60).padStart(2, '0')

  return (
    <div className={styles.countdown}>
      <div className={styles.label}>Próxima ronda en</div>
      <div className={styles.timer}>
        {minutes}:{seconds}
      </div>
    </div>
  )
}
