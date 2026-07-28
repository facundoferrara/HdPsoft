import { useState, useEffect } from 'react'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { roundsRef } from '../firebase/db'

export function useRounds() {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(roundsRef, orderBy('round_number'))
    const unsub = onSnapshot(q, (snap) => {
      setRounds(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  // La ronda activa es la última que no está 'complete'
  const currentRound =
    rounds.find((r) => r.status === 'active') ??
    rounds.find((r) => r.status === 'pending') ??
    null

  const nextRoundNumber = (rounds.at(-1)?.round_number ?? 0) + 1
  const allComplete = rounds.length > 0 && rounds.every((r) => r.status === 'complete')

  return { rounds, currentRound, nextRoundNumber, allComplete, loading }
}
