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
  zone_values: { hand: 1, body: 2, head: 3, presa: 3 },
  starting_points: 5,
  exchanges_to_win: 3,
  self_disarm_base: 3,
}

const EVENT_CONFIG = {
  status: 'setup',
  break_ends_at: null,
  target_end_time: '18:00',
}

const FIGHTERS = [
  { name: 'Rodrigo Vidal',   club: 'CDS', tier: 'acero',  role: 'referee' },
  { name: 'Camila Torres',   club: 'CDS', tier: 'nylon',  role: 'judge' },
  { name: 'Matías Peralta',  club: 'CDS', tier: 'acero',  role: 'both' },
  { name: 'Valentina Ruiz',  club: 'CDS', tier: 'boffer', role: 'judge' },
  { name: 'Lucas Herrera',   club: 'CDS', tier: 'nylon',  role: 'referee' },
  { name: 'Ignacio Blanco',  club: 'EdN', tier: 'acero',  role: 'both' },
  { name: 'Sofía Mendez',    club: 'EdN', tier: 'nylon',  role: 'judge' },
  { name: 'Tomás Ríos',      club: 'EdN', tier: 'boffer', role: 'judge' },
  { name: 'Ana Gutiérrez',   club: 'EdN', tier: 'acero',  role: 'referee' },
  { name: 'Felipe Castro',   club: 'EdN', tier: 'nylon',  role: 'both' },
  { name: 'Carolina Mora',   club: 'SOe', tier: 'acero',  role: 'referee' },
  { name: 'Diego Salinas',   club: 'SOe', tier: 'boffer', role: 'judge' },
  { name: 'Paola Jiménez',   club: 'SOe', tier: 'nylon',  role: 'both' },
  { name: 'Andrés Vargas',   club: 'SOe', tier: 'acero',  role: 'referee' },
  { name: 'Natalia Fuentes', club: 'SOe', tier: 'nylon',  role: 'judge' },
  { name: 'Gabriel Rojas',   club: 'EsL', tier: 'acero',  role: 'both' },
  { name: 'Daniela Soto',    club: 'EsL', tier: 'boffer', role: 'judge' },
  { name: 'Pablo Núñez',     club: 'EsL', tier: 'nylon',  role: 'referee' },
  { name: 'Fernanda Ortega', club: 'EsL', tier: 'acero',  role: 'both' },
  { name: 'Marco Ibáñez',    club: 'Ind', tier: 'nylon',  role: 'judge' },
  { name: 'Laura Espinoza',  club: 'Ind', tier: 'acero',  role: 'referee' },
  { name: 'Cristián Pino',   club: 'Ind', tier: 'boffer', role: 'judge' },
  { name: 'Javiera Leal',    club: 'Ind', tier: 'nylon',  role: 'both' },
  { name: 'Sebastián Mora',  club: 'Ind', tier: 'acero',  role: 'referee' },
]

// -- Escritura ----------------------------------------------------------------

async function clearCollection(colName) {
  const snap = await getDocs(collection(db, colName))
  if (snap.empty) return 0
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}

async function seed() {
  console.log('Iniciando seed en proyecto:', envVars.VITE_FIREBASE_PROJECT_ID)

  await setDoc(doc(db, 'config', 'scoring'), SCORING_CONFIG)
  console.log('  config/scoring ok')

  await setDoc(doc(db, 'config', 'event'), EVENT_CONFIG)
  console.log('  config/event ok')

  const deletedF = await clearCollection('fighters')
  const deletedL = await clearCollection('leaderboard')
  if (deletedF) console.log(`  ${deletedF} fighters anteriores eliminados`)
  if (deletedL) console.log(`  ${deletedL} entradas de leaderboard eliminadas`)

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
