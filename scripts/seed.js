/**
 * seed.js � Puebla Firestore de staging con datos de prueba.
 * Uso: node scripts/seed.js
 *
 * Usa el client SDK de Firebase (no Admin) porque la base est� en test mode.
 * No requiere service account ni credenciales adicionales.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Parseo manual del .env (no depende de dotenv en el build)
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore'

const app = initializeApp({
  apiKey: envVars.VITE_FIREBASE_API_KEY,
  authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envVars.VITE_FIREBASE_APP_ID,
})

const db = getFirestore(app)

// -- Datos de prueba ----------------------------------------------------------

const SCORING_CONFIG = {
  zone_values: { hand: 1, body: 2, head: 3, presa: 3, presa_mutua: 2 },
  starting_points: 5,
  exchanges_to_win: 3,
  self_disarm_base: 3,
}

const EVENT_CONFIG = {
  status: 'setup',
  break_ends_at: null,
  target_end_time: '18:00',
}

const FIGHTERS_RAW = [
  { name: 'Leonor Natalini',             club: 'Cruz del Sur',     tier: 'nylon',  role: 'judge' },
  { name: 'Andrés Eylenstein',           club: 'Cruz del Sur',     tier: 'acero',  role: 'both' },
  { name: 'Tomás Ezequiel Celedón',      club: 'Cruz del Sur',     tier: 'acero',  role: 'referee' },
  { name: 'Marcos Ayala Lao',            club: 'Cruz del Sur',     tier: 'nylon',  role: 'both' },
  { name: 'Facundo Ferrara',             club: 'Cruz del Sur',     tier: 'acero',  role: 'both' },
  { name: 'Cristian Adrián Yaniz',       club: 'Cruz del Sur',     tier: 'acero',  role: 'referee' },
  { name: 'Lautaro Antonio',             club: 'Cruz del Sur',     tier: 'boffer', role: 'judge' },
  { name: 'Thiago Soria',                club: 'Cruz del Sur',     tier: 'boffer', role: 'judge' },
  { name: 'Teo Campoy',                  club: 'Cruz del Sur',     tier: 'nylon',  role: 'both' },
  { name: 'Juan Pedro Vilardebó',        club: 'Cruz del Sur',     tier: 'boffer', role: 'none' },
  { name: 'Raiquen Rodríguez',           club: 'FadW',             tier: 'acero',  role: 'both' },
  { name: 'Facundo Emiliano Pepe Schell', club: 'FadW',            tier: 'nylon',  role: 'judge' },
  { name: 'Néstor Torres',               club: 'FadW',             tier: 'acero',  role: 'referee' },
  { name: 'Fabian Vilariño',             club: 'FadW',             tier: 'nylon',  role: 'both' },
  { name: 'Roberto Taschuk',             club: 'FadW',             tier: 'acero',  role: 'both' },
  { name: 'Santiago Martinez',           club: 'FadW',             tier: 'boffer', role: 'none' },
  { name: 'Enrique Sueiro',              club: 'FadW',             tier: 'nylon',  role: 'referee' },
  { name: 'Sebastián Ferrara',           club: 'Sol del Norte',    tier: 'acero',  role: 'both' },
  { name: 'Gerónimo Hernán Videla Toteda', club: 'Vincere',        tier: 'acero',  role: 'referee' },
  { name: 'Julieta Virginia Ramos',      club: 'Vincere',          tier: 'nylon',  role: 'judge' },
  { name: 'Martín Bianchi',              club: 'Vincere',          tier: 'acero',  role: 'both' },
  { name: 'Martin Stead',                club: 'Vincere',          tier: 'nylon',  role: 'referee' },
  { name: 'Gonzalo Fernandez',           club: 'Vincere',          tier: 'acero',  role: 'both' },
  { name: 'Nicolas Ramos',               club: 'Vincere',          tier: 'boffer', role: 'judge' },
  { name: 'Juan Cruz Rodríguez',         club: 'Vincere',          tier: 'nylon',  role: 'judge' },
  { name: 'Cristian Scotti',             club: 'Vincere',          tier: 'acero',  role: 'referee' },
  { name: 'Joaquín Bentancur Flores',    club: 'SMCD',             tier: 'nylon',  role: 'both' },
  { name: 'Joaquin Wohler',              club: 'SMCD',             tier: 'boffer', role: 'judge' },
  { name: 'Hector Balbuzano',            club: 'Duelist Academy',  tier: 'acero',  role: 'referee' },
  { name: 'Katia Ramos',                 club: 'Duelist Academy',  tier: 'nylon',  role: 'both' },
  { name: 'Ariel García',                club: 'Independiente',    tier: 'acero',  role: 'referee' },
]

function shortName(full) {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 2) return full
  return `${parts[0]} ${parts[parts.length - 1]}`
}

const FIGHTERS = FIGHTERS_RAW.map((f) => ({ ...f, name: shortName(f.name) }))

// -- Escritura ----------------------------------------------------------------

async function batchDelete(docs) {
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db)
    docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  return docs.length
}

async function clearCollection(colName) {
  const snap = await getDocs(collection(db, colName))
  if (snap.empty) return 0
  return batchDelete(snap.docs)
}

async function clearMatchesWithExchanges() {
  const matchesSnap = await getDocs(collection(db, 'matches'))
  if (matchesSnap.empty) return 0
  let exchCount = 0
  for (const matchDoc of matchesSnap.docs) {
    const exchSnap = await getDocs(collection(db, 'matches', matchDoc.id, 'exchanges'))
    if (!exchSnap.empty) {
      await batchDelete(exchSnap.docs)
      exchCount += exchSnap.size
    }
  }
  await batchDelete(matchesSnap.docs)
  return { matches: matchesSnap.size, exchanges: exchCount }
}

async function seed() {
  console.log('Iniciando seed en proyecto:', envVars.VITE_FIREBASE_PROJECT_ID)

  await setDoc(doc(db, 'config', 'scoring'), SCORING_CONFIG)
  console.log('  config/scoring ok')

  await setDoc(doc(db, 'config', 'event'), EVENT_CONFIG)
  console.log('  config/event ok')

  await setDoc(doc(db, 'config', 'weapons'), { custom: [] })
  console.log('  config/weapons ok')

  const deletedF = await clearCollection('fighters')
  const deletedL = await clearCollection('leaderboard')
  if (deletedF) console.log(`  ${deletedF} fighters anteriores eliminados`)
  if (deletedL) console.log(`  ${deletedL} entradas de leaderboard eliminadas`)

  const { matches: mDel, exchanges: eDel } = await clearMatchesWithExchanges()
  if (mDel) console.log(`  ${mDel} matches eliminados (${eDel} exchanges)`)

  for (const col of ['rounds', 'byes', 'control_stats']) {
    const deleted = await clearCollection(col)
    if (deleted) console.log(`  ${deleted} ${col} eliminados`)
  }

  const fighterRefs = []
  for (const f of FIGHTERS) {
    const ref = await addDoc(collection(db, 'fighters'), f)
    fighterRefs.push({ ref, data: f })
  }
  console.log(`  ${fighterRefs.length} fighters creados`)

  const lbBatch = writeBatch(db)
  for (const { ref, data } of fighterRefs) {
    lbBatch.set(doc(db, 'leaderboard', ref.id), {
      fighter_id: ref.id,
      name: data.name,
      club: data.club,
      total_points: 0,
      rounds_played: 0,
      matches_complete: 0,
      bye_count: 0,
      points_lost_defense: 0,
      clean_head_hits: 0,
      points_rescued_contrapaso: 0,
      wins_espada_larga: 0,
      matches_won: 0,
      matches_lost: 0,
      matches_drawn: 0,
      hand_hits_landed: 0,
      double_hit_count: 0,
      contrapaso_count: 0, clean_hand_hits: 0, clean_body_hits: 0,
      clean_exchanges_won: 0,
      total_valid_exchanges: 0,
    })
  }
  await lbBatch.commit()
  console.log(`  leaderboard inicializado (${fighterRefs.length} entradas)`)

  console.log('\nSeed completo.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Error en seed:', err.message)
  process.exit(1)
})
