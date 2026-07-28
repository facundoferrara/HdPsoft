import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { eventConfigRef } from '../firebase/db'

/**
 * Suscribe al documento config/event.
 * Retorna { status, break_ends_at, target_end_time, loading }.
 */
export function useEventStatus() {
  const [eventStatus, setEventStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(eventConfigRef, (snap) => {
      setEventStatus(snap.data())
      setLoading(false)
    })
    return unsub
  }, [])

  return { eventStatus, loading }
}
