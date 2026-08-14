import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { fightersRef } from '../firebase/db'

/** Todos los fighters. Retorna lista + mapa { [id]: fighter } */
export function useFighters() {
  const [fighters, setFighters] = useState([])
  const [fightersMap, setFightersMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(fightersRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setFighters(list)
      setFightersMap(Object.fromEntries(list.map((f) => [f.id, f])))
      setLoading(false)
    })
    return unsub
  }, [])

  const activeFighters = fighters.filter((f) => !['tbd', 'na'].includes(f.tier) && f.status !== 'paused' && f.status !== 'disqualified')
  const controlBodyEligible = fighters.filter((f) => f.tier !== 'tbd' && ['referee', 'judge', 'both'].includes(f.role) && f.status !== 'disqualified')

  return { fighters, activeFighters, controlBodyEligible, fightersMap, loading }
}
