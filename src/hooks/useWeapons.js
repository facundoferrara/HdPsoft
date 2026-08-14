import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { weaponsConfigRef } from '../firebase/db'

const PRESET_WEAPONS = [
  'sable',
  'espada a dos manos',
  'espada y broquel',
  'espada sola',
  'partesana',
  'espada y rodela',
]

export function useWeapons() {
  const [custom, setCustom] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(weaponsConfigRef, (snap) => {
      const data = snap.data()
      setCustom(data?.custom ?? [])
    })
    return unsub
  }, [])

  const weapons = [...PRESET_WEAPONS, ...custom.filter((w) => !PRESET_WEAPONS.includes(w))]
  return { weapons }
}
