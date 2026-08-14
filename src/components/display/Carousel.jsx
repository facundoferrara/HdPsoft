import { useState, useEffect, useRef, Children } from 'react'
import styles from './Carousel.module.css'

export default function Carousel({ children, intervalMs = 8000, onCycleComplete }) {
  const items = Children.toArray(children)
  const count = items.length
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const [animClass, setAnimClass] = useState('in')
  const progressRef = useRef(0)
  const transitioning = useRef(false)
  const onCycleRef = useRef(onCycleComplete)
  const activeRef = useRef(0)
  onCycleRef.current = onCycleComplete

  useEffect(() => {
    if (count <= 1) return
    progressRef.current = 0
    transitioning.current = false

    const tick = 50
    const timer = setInterval(() => {
      if (transitioning.current) return

      progressRef.current += (tick / intervalMs) * 100
      if (progressRef.current >= 100) {
        transitioning.current = true
        setProgress(100)
        setAnimClass('out')
        setTimeout(() => {
          const next = (activeRef.current + 1) % count
          activeRef.current = next
          setActive(next)
          progressRef.current = 0
          setProgress(0)
          setAnimClass('in')
          transitioning.current = false
          if (next === 0) {
            setTimeout(() => onCycleRef.current?.(), 0)
          }
        }, 400)
      } else {
        setProgress(progressRef.current)
      }
    }, tick)
    return () => clearInterval(timer)
  }, [count, intervalMs])

  return (
    <div className={styles.carousel}>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ transform: `scaleX(${(100 - progress) / 100})` }} />
      </div>
      <div key={active} className={`${styles.slideContainer} ${animClass === 'out' ? styles.slideOut : styles.slideIn}`}>
        {items[active]}
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ transform: `scaleX(${(100 - progress) / 100})` }} />
      </div>
    </div>
  )
}
