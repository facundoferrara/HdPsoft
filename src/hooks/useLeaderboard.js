import { useState, useEffect } from 'react'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { leaderboardRef } from '../firebase/db'

/**
 * Suscribe al leaderboard ordenado por total_points desc.
 * @param {number} [cap]  Límite de resultados. Sin límite por defecto.
 */
export function useLeaderboard(cap) {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const constraints = [orderBy('total_points', 'desc')]
    const q = query(leaderboardRef, ...constraints)

    const unsub = onSnapshot(q, (snap) => {
      let entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      if (cap) entries = entries.slice(0, cap)
      setLeaderboard(entries)
      setLoading(false)
    })
    return unsub
  }, [cap])

  return { leaderboard, loading }
}
