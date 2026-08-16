import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const app = initializeApp({
  apiKey: envVars.VITE_FIREBASE_API_KEY,
  authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envVars.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)

async function run() {
  console.log('Exporting fighters...')
  const fightersSnap = await getDocs(collection(db, 'fighters'))
  const fighters = fightersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  ${fighters.length} fighters`)

  console.log('Exporting rounds...')
  const roundsSnap = await getDocs(collection(db, 'rounds'))
  const rounds = roundsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  ${rounds.length} rounds`)

  console.log('Exporting matches...')
  const matchesSnap = await getDocs(collection(db, 'matches'))
  const matches = []
  for (const d of matchesSnap.docs) {
    const match = { id: d.id, ...d.data() }
    const exchSnap = await getDocs(collection(db, 'matches', d.id, 'exchanges'))
    match.exchanges = exchSnap.docs.map(e => ({ id: e.id, ...e.data() }))
    matches.push(match)
  }
  console.log(`  ${matches.length} matches`)

  console.log('Exporting leaderboard...')
  const lbSnap = await getDocs(collection(db, 'leaderboard'))
  const leaderboard = lbSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  ${leaderboard.length} leaderboard entries`)

  console.log('Exporting control_stats...')
  const csSnap = await getDocs(collection(db, 'control_stats'))
  const controlStats = csSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`  ${controlStats.length} control_stats entries`)

  const outPath = resolve(__dirname, '../firebase-export.json')
  writeFileSync(outPath, JSON.stringify({ fighters, rounds, matches, leaderboard, controlStats }, null, 2))
  console.log(`\nExported to ${outPath}`)
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
