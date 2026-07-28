import { useLeaderboard } from '../hooks/useLeaderboard'
import styles from './Stats.module.css'

/** Vista pública de estadísticas — /stats */
export default function Stats() {
  const { leaderboard, loading } = useLeaderboard()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>HDP 2026 · Estadísticas</h1>
      </header>
      <main className={styles.content}>
        {loading ? (
          <p>Cargando…</p>
        ) : (
          <section className={styles.section}>
            <h2>Clasificación completa</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Club</th>
                  <th>Puntos</th>
                  <th>Asaltos</th>
                  <th>Byes</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr key={entry.id}>
                    <td>{i + 1}</td>
                    <td>{entry.name}</td>
                    <td>{entry.club}</td>
                    <td>{entry.total_points.toFixed(2)}</td>
                    <td>{entry.matches_complete}</td>
                    <td>{entry.bye_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  )
}
