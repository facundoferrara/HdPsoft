import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { controlStatsRef } from '../firebase/db'

/** Contadores acumulados de arbitraje/jueceo por persona, para todo el evento. */
export function useControlStats() {
  const [statsMap, setStatsMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(controlStatsRef, (snap) => {
      setStatsMap(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])))
      setLoading(false)
    })
    return unsub
  }, [])

  return { statsMap, loading }
}
