import styles from './BreakPopup.module.css'
import { setEventBreak, resumeEvent } from '../../firebase/writes'

export default function BreakPopup({ onClose }) {
  async function handleOption(minutes) {
    await setEventBreak(minutes)
    onClose()
  }

  async function handleSkip() {
    await resumeEvent()
    onClose()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <h2 className={styles.title}>Ronda completada</h2>
        <p className={styles.sub}>¿Cuánto tiempo de descanso?</p>
        <div className={styles.options}>
          <button className={`${styles.btn} ${styles.skip}`} onClick={handleSkip}>Sin descanso</button>
          <button className={styles.btn} onClick={() => handleOption(5)}>5 min</button>
          <button className={styles.btn} onClick={() => handleOption(10)}>10 min</button>
          <button className={`${styles.btn} ${styles.manual}`} onClick={() => handleOption(null)}>
            Pausa manual
          </button>
        </div>
      </div>
    </div>
  )
}
