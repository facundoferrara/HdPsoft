import { db } from './config'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore'

// ── Config ──────────────────────────────────────────────────────────────────

export const scoringConfigRef = doc(db, 'config', 'scoring')
export const eventConfigRef = doc(db, 'config', 'event')

// ── Collections ──────────────────────────────────────────────────────────────

export const fightersRef = collection(db, 'fighters')
export const roundsRef = collection(db, 'rounds')
export const matchesRef = collection(db, 'matches')
export const leaderboardRef = collection(db, 'leaderboard')
export const byesRef = collection(db, 'byes')
export const controlStatsRef = collection(db, 'control_stats')

/** Subcolección de intercambios de un asalto */
export const exchangesRef = (matchId) =>
  collection(db, 'matches', matchId, 'exchanges')

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getScoringConfig() {
  const snap = await getDoc(scoringConfigRef)
  return snap.data()
}
