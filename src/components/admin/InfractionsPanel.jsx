import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useFighters } from '../../hooks/useFighters'
import styles from './InfractionsPanel.module.css'

export default function InfractionsPanel() {
  const { fightersMap } = useFighters()
  const [infractions, setInfractions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const matchesSnap = await getDocs(collection(db, 'matches'))
      const counts = {}

      for (const matchDoc of matchesSnap.docs) {
        const exchSnap = await getDocs(collection(db, 'matches', matchDoc.id, 'exchanges'))
        for (const exchDoc of exchSnap.docs) {
          const exch = exchDoc.data()
          for (const pen of exch.penalties ?? []) {
            const fid = pen.fighter === 'red'
              ? matchDoc.data().fighter_red_id
              : matchDoc.data().fighter_blue_id
            if (!counts[fid]) counts[fid] = { warnings: 0, yellows: 0, reds: 0 }
            if (pen.type === 'warning') counts[fid].warnings++
            if (pen.type === 'yellow') counts[fid].yellows++
            if (pen.type === 'red') counts[fid].reds++
          }
        }
      }

      setInfractions(
        Object.entries(counts)
          .map(([id, c]) => ({ id, ...c }))
          .sort((a, b) => b.yellows - a.yellows)
          .slice(0, 5)
      )
      setLoading(false)
    }
    load()
  }, [fightersMap])

  if (loading) return <div className={styles.loading}>Cargando...</div>
  if (!infractions.length) return <div className={styles.empty}>Sin infracciones registradas.</div>

  return (
    <div className={styles.page}>
      <h3 className={styles.title}>Top 5 infractores</h3>
      <table className={styles.table}>
        <thead>
          <tr><th>Nombre</th><th>Club</th><th>Adv.</th><th>Amarillas</th><th>Rojas</th></tr>
        </thead>
        <tbody>
          {infractions.map((inf) => {
            const f = fightersMap[inf.id]
            return (
              <tr key={inf.id} className={inf.reds > 0 ? styles.rowRed : ''}>
                <td>{f?.name ?? inf.id}</td>
                <td>{f?.club ?? '—'}</td>
                <td>{inf.warnings}</td>
                <td className={styles.yellow}>{inf.yellows}</td>
                <td className={styles.red}>{inf.reds}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
