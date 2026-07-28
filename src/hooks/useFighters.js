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

  const activeFighters = fighters.filter((f) => !['tbd', 'na'].includes(f.tier))

  return { fighters, activeFighters, fightersMap, loading }
}
