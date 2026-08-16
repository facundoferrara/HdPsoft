/**
 * import.js — Importa el padrón de inscriptos desde el TSV exportado de Google Forms.
 *
 * Uso:
 *   node scripts/import.js <ruta-al-archivo.tsv>
 *
 * Qué hace:
 *   - Lee el TSV y parsea solo los campos relevantes para el sistema.
 *   - Limpia la colección fighters + leaderboard existentes.
 *   - Escribe los nuevos fighters y sus entradas de leaderboard.
 *   - NO toca config/scoring ni config/event.
 *
 * Participantes que no anotaron el torneo del 15/08 se importan con tier='na'
 * (presentes en el evento, disponibles como cuerpo de control).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Leer .env ─────────────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '../.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  collection,
  addDoc,
  getDocs,
  writeBatch,
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

// ── Parseo TSV ────────────────────────────────────────────────────────────────

const TORNEO_15 = 'Torneo de Esgrima'

/**
 * Convierte la categoría de equipo del formulario a tier interno.
 * "Acero (+ ...)" → 'acero'
 * "Nylón (...)"   → 'nylon'
 * "Boffer (...)"  → 'boffer'
 * vacío           → 'tbd'
 */
function parseTier(raw) {
  if (!raw || raw.trim() === '') return 'tbd'
  const v = raw.trim().toLowerCase()
  if (v.startsWith('acero'))  return 'acero'
  if (v.startsWith('nylón') || v.startsWith('nylon')) return 'nylon'
  if (v.startsWith('boffer')) return 'boffer'
  return 'tbd'
}

/**
 * Convierte el rol del cuerpo de control a rol interno.
 * "Arbitraje"        → 'referee'
 * "Jueceo/Grabación" → 'judge'
 * "Ambos"            → 'both'
 * vacío / otro       → 'none'
 */
function parseRole(raw) {
  if (!raw || raw.trim() === '') return 'none'
  const v = raw.trim().toLowerCase()
  if (v.includes('arbitraje') || v.startsWith('árbitr')) return 'referee'
  if (v.includes('jueceo') || v.includes('grabaci')) return 'judge'
  if (v === 'ambos') return 'both'
  return 'none'
}

/**
 * Normaliza el nombre del club al código corto.
 * Los valores del formulario son libres (texto), así que hacemos match
 * por substring/lower. Cualquier valor desconocido queda como está.
 */
function parseClub(raw) {
  if (!raw || raw.trim() === '') return 'Ind'
  const v = raw.trim()
  const lower = v.toLowerCase()
  if (lower === 'cds' || lower === 'cds' || lower === 'círculo de esgrima histórica cruz del sur') return 'CDS'
  if (lower === 'edn' || lower.includes('estudiantes del norte')) return 'EdN'
  if (lower === 'soe' || lower.includes('sur oeste')) return 'SOe'
  if (lower === 'esl' || lower.includes('espada larga')) return 'EsL'
  if (lower === 'fadw' || lower.includes('fad')) return 'FadW'
  if (lower === 'vincere' || lower.includes('vincere')) return 'Vincere'
  if (lower === 'scolari' || lower.includes('scolari')) return 'Scolari'
  if (lower === 'motus' || lower.includes('motus')) return 'Motus'
  if (lower === 'autonomo' || lower === 'autónomo' || lower === 'independiente') return 'Ind'
  // Devolver tal cual si no hay match (ej. clubs nuevos)
  return v
}

/**
 * Parsea una línea TSV respetando posibles tabs dentro de campos entre comillas.
 * El export de Google Forms no suele entrecomillar, pero es más robusto.
 */
function parseTSVLine(line) {
  return line.split('\t').map((v) => v.trim())
}

function parseTSV(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '')
  const [headerLine, ...dataLines] = lines
  const headers = parseTSVLine(headerLine)

  return dataLines.map((line) => {
    const values = parseTSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

// ── Columnas del formulario (índice por nombre de header) ─────────────────────

function rowToFighter(row) {
  const nombres   = (row['Nombres'] ?? '').trim()
  const apellidos = (row['Apellidos'] ?? '').trim()
  const preferido = (row['Nombre Preferido'] ?? '').trim()

  // Si tiene nombre preferido, usarlo; si no, Nombres + Apellidos
  const name = preferido !== '' ? preferido : `${nombres} ${apellidos}`.trim()

  const club   = parseClub(row['Club/Escuela'] ?? '')
  const eventos = row['Seleccione los eventos en que va a participar'] ?? ''
  const participaTorneo = eventos.includes(TORNEO_15) || eventos.trim().toLowerCase() === 'ambos'

  // Si no participa del torneo del 15/08, no pertenece al sistema
  if (!participaTorneo) return null

  const tier = parseTier(row['Categoría de equipo pretendida'] ?? '')

  const role = parseRole(row['Rol en Cuerpo de Control'] ?? '')

  // Flag de condición médica relevante (no se guarda el texto completo)
  const medical = row['Condición médica relevante'] ?? ''
  const hasMedicalNote = medical.trim() !== '' &&
    medical.trim().toLowerCase() !== 'ninguna' &&
    medical.trim().toLowerCase() !== 'ninguna/prefiero no decir'

  return {
    name,
    club,
    tier,
    role,
    ...(hasMedicalNote ? { medical_note: true } : {}),
  }
}

// ── Firebase helpers ──────────────────────────────────────────────────────────

async function clearCollection(colName) {
  const snap = await getDocs(collection(db, colName))
  if (snap.empty) return 0
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function importRoster() {
  const tsvPath = process.argv[2]
  if (!tsvPath) {
    console.error('Uso: node scripts/import.js <ruta-al-archivo.tsv>')
    process.exit(1)
  }

  const raw = readFileSync(resolve(tsvPath), 'utf8')
  const rows = parseTSV(raw)

  const fighters = rows.map(rowToFighter).filter(Boolean)

  // Resumen antes de escribir
  const byTier = fighters.reduce((acc, f) => {
    acc[f.tier] = (acc[f.tier] ?? 0) + 1
    return acc
  }, {})
  const byClub = fighters.reduce((acc, f) => {
    acc[f.club] = (acc[f.club] ?? 0) + 1
    return acc
  }, {})

  console.log(`\nImportando a proyecto: ${envVars.VITE_FIREBASE_PROJECT_ID}`)
  console.log(`Total inscriptos: ${fighters.length}`)
  console.log('Por tier:', byTier)
  console.log('Por club:', byClub)

  const withMedical = fighters.filter((f) => f.medical_note)
  if (withMedical.length > 0) {
    console.log(`\n⚠️  Condición médica relevante (${withMedical.length}):`)
    withMedical.forEach((f) => console.log(`   - ${f.name} (${f.club})`))
  }

  console.log('\nLimpiando colecciones anteriores...')
  const deletedF = await clearCollection('fighters')
  const deletedL = await clearCollection('leaderboard')
  if (deletedF) console.log(`  ${deletedF} fighters eliminados`)
  if (deletedL) console.log(`  ${deletedL} entradas de leaderboard eliminadas`)

  console.log('Escribiendo nuevos inscriptos...')
  const fighterRefs = []
  for (const f of fighters) {
    const ref = await addDoc(collection(db, 'fighters'), f)
    fighterRefs.push({ ref, data: f })
    console.log(`  ✓ ${f.name} (${f.club}, ${f.tier})`)
  }

  const lbBatch = writeBatch(db)
  for (const { ref, data } of fighterRefs) {
    lbBatch.set(doc(db, 'leaderboard', ref.id), {
      fighter_id: ref.id,
      name: data.name,
      club: data.club,
      total_points: 0,
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
  console.log(`\nLeaderboard inicializado (${fighterRefs.length} entradas)`)

  console.log('\n✅ Importación completa.')
  process.exit(0)
}

importRoster().catch((err) => {
  console.error('Error en importación:', err.message)
  process.exit(1)
})
