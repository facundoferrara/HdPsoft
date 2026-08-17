import { useState, useEffect, useRef, useCallback, Children } from 'react'
import styles from './Carousel.module.css'

export default function Carousel({ children, intervalMs = 8000, onCycleComplete, paused = false }) {
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

  // Manual navigation (dir: +1 or -1)
  const navigate = useCallback((dir) => {
    if (transitioning.current || count <= 1) return
    transitioning.current = true
    progressRef.current = 0
    setProgress(0)
    setAnimClass('out')
    setTimeout(() => {
      const next = ((activeRef.current + dir) % count + count) % count
      activeRef.current = next
      setActive(next)
      setAnimClass('in')
      transitioning.current = false
      if (next === 0 && dir > 0) setTimeout(() => onCycleRef.current?.(), 0)
    }, 350)
  }, [count])

  const goPrev = useCallback(() => navigate(-1), [navigate])
  const goNext = useCallback(() => navigate(1), [navigate])

  // Auto-advance
  useEffect(() => {
    if (count <= 1 || paused) return
    progressRef.current = 0
    transitioning.current = false

    const tick = 50
    const timer = setInterval(() => {
      if (transitioning.current) return
      progressRef.current += (tick / intervalMs) * 100
      if (progressRef.current >= 100) {
        navigate(1)
      } else {
        setProgress(progressRef.current)
      }
    }, tick)
    return () => clearInterval(timer)
  }, [count, intervalMs, paused, navigate])

  // Keyboard
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goPrev, goNext])

  // Touch / swipe
  const touchStartX = useRef(null)
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) dx < 0 ? goNext() : goPrev()
    touchStartX.current = null
  }

  return (
    <div className={styles.carousel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {!paused && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ transform: `scaleX(${(100 - progress) / 100})` }} />
        </div>
      )}
      <div className={styles.slideWrapper}>
        <div key={active} className={`${styles.slideContainer} ${animClass === 'out' ? styles.slideOut : styles.slideIn}`}>
          {items[active]}
        </div>
        {count > 1 && (
          <>
            <button className={`${styles.arrow} ${styles.arrowLeft}`} onClick={goPrev} aria-label="Anterior">&#8249;</button>
            <button className={`${styles.arrow} ${styles.arrowRight}`} onClick={goNext} aria-label="Siguiente">&#8250;</button>
          </>
        )}
      </div>
      <div className={styles.dots}>
        {items.map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === active ? styles.dotActive : ''}`} />
        ))}
      </div>
    </div>
  )
}
