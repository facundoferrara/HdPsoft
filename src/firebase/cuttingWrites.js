import { db } from './config'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { cuttingRef } from './db'

export async function addCuttingParticipant({ name, club, weapon }) {
  await addDoc(cuttingRef, {
    name: name.trim(),
    club: club.trim(),
    weapon: (weapon || '').trim().slice(0, 50),
    rounds: {},
    final_score: null,
    created_at: serverTimestamp(),
  })
}

export async function updateCuttingParticipant(id, fields) {
  const ref = doc(db, 'cutting', id)
  await updateDoc(ref, fields)
}

export async function deleteCuttingParticipant(id) {
  await deleteDoc(doc(db, 'cutting', id))
}

export async function saveCuttingScores(participantId, roundNumber, { j1, j2, j3 }) {
  const total = j1 + j2 + j3
  const ref = doc(db, 'cutting', participantId)
  await updateDoc(ref, {
    [`rounds.${roundNumber}`]: { j1, j2, j3, total },
    final_score: total,
  })
}

export async function clearCuttingScores(participantId, roundNumber) {
  const ref = doc(db, 'cutting', participantId)
  await updateDoc(ref, {
    [`rounds.${roundNumber}`]: null,
    final_score: null,
  })
}

export async function resetAllCuttingScores() {
  const snap = await getDocs(cuttingRef)
  const batch = writeBatch(db)
  snap.docs.forEach((d) => {
    batch.update(d.ref, { rounds: {}, final_score: null })
  })
  await batch.commit()
}

export async function deleteAllCuttingParticipants() {
  const snap = await getDocs(cuttingRef)
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}
