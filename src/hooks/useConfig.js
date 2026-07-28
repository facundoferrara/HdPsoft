import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { scoringConfigRef } from '../firebase/db'

/**
 * Suscribe al documento config/scoring y retorna los valores de puntuación.
 * El componente que llame a este hook se actualiza si Ari edita la config en Firestore.
 */
export function useConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(scoringConfigRef, (snap) => {
      setConfig(snap.data())
      setLoading(false)
    })
    return unsub
  }, [])

  return { config, loading }
}
