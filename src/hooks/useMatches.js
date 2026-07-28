import { useState, useEffect } from 'react'
import { onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { matchesRef } from '../firebase/db'

/** Asaltos de una ronda específica, ordenados por match_number */
export function useRoundMatches(roundId) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roundId) {
      setMatches([])
      setLoading(false)
      return
    }
    const q = query(matchesRef, where('round_id', '==', roundId), orderBy('match_number'))
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [roundId])

  return { matches, loading }
}

/** Asaltos activos en este momento (para ArenaStatus y detección de personas ocupadas) */
export function useActiveMatches() {
  const [matches, setMatches] = useState([])

  useEffect(() => {
    const q = query(matchesRef, where('status', '==', 'active'))
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  return matches
}
