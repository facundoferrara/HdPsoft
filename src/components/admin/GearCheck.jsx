import { useFighters } from '../../hooks/useFighters'
import { updateFighterGear } from '../../firebase/writes'
import styles from './GearCheck.module.css'

const TIERS = ['tbd', 'boffer', 'nylon', 'acero', 'na']
const TIER_LABELS = { tbd: 'Pendiente', boffer: 'Boffer', nylon: 'Nylon', acero: 'Acero', na: 'No presente' }

export default function GearCheck() {
  const { fighters, loading } = useFighters()

  if (loading) return <div className={styles.loading}>Cargando...</div>

  const byClub = fighters.reduce((acc, f) => {
    if (!acc[f.club]) acc[f.club] = []
    acc[f.club].push(f)
    return acc
  }, {})

  const counts = {
    active: fighters.filter((f) => !['tbd', 'na'].includes(f.tier)).length,
    tbd: fighters.filter((f) => f.tier === 'tbd').length,
    na: fighters.filter((f) => f.tier === 'na').length,
  }

  async function handleTierChange(fighter, tier) {
    await updateFighterGear(fighter.id, tier)
  }

  return (
    <div className={styles.page}>
      <div className={styles.summary}>
        <span className={styles.chip}>✓ {counts.active} acreditados</span>
        {counts.tbd > 0 && <span className={`${styles.chip} ${styles.chipPending}`}>⏳ {counts.tbd} pendientes</span>}
        {counts.na > 0 && <span className={`${styles.chip} ${styles.chipAbsent}`}>✗ {counts.na} ausentes</span>}
      </div>

      {Object.entries(byClub).sort().map(([club, clubFighters]) => (
        <div key={club} className={styles.clubSection}>
          <h3 className={styles.clubName}>{club}</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {clubFighters.map((f) => (
                <tr
                  key={f.id}
                  className={
                    f.tier === 'na' ? styles.rowAbsent
                    : f.tier === 'tbd' ? styles.rowPending
                    : styles.rowActive
                  }
                >
                  <td className={styles.name}>{f.name}</td>
                  <td className={styles.role}>{f.role}</td>
                  <td>
                    <select
                      className={`${styles.tierSelect} ${styles[`tier_${f.tier}`]}`}
                      value={f.tier}
                      onChange={(e) => handleTierChange(f, e.target.value)}
                    >
                      {TIERS.map((t) => (
                        <option key={t} value={t}>{TIER_LABELS[t]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
