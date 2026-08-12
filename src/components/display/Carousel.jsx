import { useState, useEffect, useRef, Children } from 'react'
import styles from './Carousel.module.css'

export default function Carousel({ children, intervalMs = 8000 }) {
  const items = Children.toArray(children)
  const count = items.length
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const [animClass, setAnimClass] = useState('in')
  const progressRef = useRef(0)
  const transitioning = useRef(false)

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
          setActive((i) => (i + 1) % count)
          progressRef.current = 0
          setProgress(0)
          setAnimClass('in')
          transitioning.current = false
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
        <div className={styles.progressFill} style={{ width: `${100 - progress}%` }} />
      </div>
      <div key={active} className={`${styles.slideContainer} ${animClass === 'out' ? styles.slideOut : styles.slideIn}`}>
        {items[active]}
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${100 - progress}%` }} />
      </div>
    </div>
  )
}
