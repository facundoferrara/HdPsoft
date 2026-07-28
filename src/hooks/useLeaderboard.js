import { useState, useEffect } from 'react'
import { onSnapshot, query, orderBy, limit } from 'firebase/firestore'
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
    if (cap) constraints.push(limit(cap))
    const q = query(leaderboardRef, ...constraints)

    const unsub = onSnapshot(q, (snap) => {
      setLeaderboard(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [cap])

  return { leaderboard, loading }
}
