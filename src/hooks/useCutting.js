import { useState, useEffect } from 'react'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { cuttingRef } from '../firebase/db'

export function useCutting() {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(cuttingRef, orderBy('created_at', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  return { participants, loading }
}
