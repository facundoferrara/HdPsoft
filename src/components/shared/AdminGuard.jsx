import { useState, useEffect } from 'react'
import styles from './AdminGuard.module.css'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'hdp2026'
const SESSION_KEY = 'hdp_admin_auth'

export default function AdminGuard({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') setAuthenticated(true)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (input === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setAuthenticated(true)
    } else {
      setError(true)
      setInput('')
    }
  }

  if (authenticated) return children

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>HDP 2026</h1>
        <p className={styles.sub}>Panel de Autoridad de Mesa</p>
        <input
          className={`${styles.input} ${error ? styles.inputError : ''}`}
          type="password"
          placeholder="Contraseña"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(false) }}
          autoFocus
        />
        {error && <p className={styles.errorMsg}>Contraseña incorrecta</p>}
        <button className={styles.btn} type="submit">Entrar</button>
      </form>
    </div>
  )
}
