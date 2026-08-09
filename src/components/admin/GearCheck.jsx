import { useState } from 'react'
import { useFighters } from '../../hooks/useFighters'
import { updateFighterGear, addStaffMember } from '../../firebase/writes'
import styles from './GearCheck.module.css'

const TIERS = ['tbd', 'boffer', 'nylon', 'acero', 'na']
const TIER_LABELS = { tbd: 'Pendiente', boffer: 'Boffer', nylon: 'Nylon', acero: 'Acero', na: 'Staff / no compite' }

const CONTROL_ROLES = ['both', 'referee', 'judge', 'none']
const CONTROL_ROLE_LABELS = { both: 'Árbitro y juez', referee: 'Solo árbitro', judge: 'Solo juez', none: 'Ninguno' }

export default function GearCheck() {
  const { fighters, loading } = useFighters()
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffClub, setStaffClub] = useState('')
  const [staffRole, setStaffRole] = useState('both')
  const [savingStaff, setSavingStaff] = useState(false)

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

  async function handleAddStaff(e) {
    e.preventDefault()
    if (!staffName.trim() || savingStaff) return
    setSavingStaff(true)
    try {
      await addStaffMember({ name: staffName.trim(), club: staffClub.trim(), role: staffRole })
      setStaffName(''); setStaffClub(''); setStaffRole('both'); setShowAddStaff(false)
    } finally {
      setSavingStaff(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.summary}>
        <span className={styles.chip}>✓ {counts.active} acreditados</span>
        {counts.tbd > 0 && <span className={`${styles.chip} ${styles.chipPending}`}>⏳ {counts.tbd} pendientes</span>}
        {counts.na > 0 && <span className={`${styles.chip} ${styles.chipAbsent}`}>👥 {counts.na} staff/no compite</span>}
        <button className={styles.addStaffBtn} onClick={() => setShowAddStaff((v) => !v)}>
          {showAddStaff ? '✕ Cancelar' : '+ Agregar persona presente'}
        </button>
      </div>

      {showAddStaff && (
        <form className={styles.addStaffForm} onSubmit={handleAddStaff}>
          <input
            className={styles.addStaffInput}
            placeholder="Nombre"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            autoFocus
          />
          <input
            className={styles.addStaffInput}
            placeholder="Club (opcional)"
            value={staffClub}
            onChange={(e) => setStaffClub(e.target.value)}
          />
          <select
            className={styles.addStaffSelect}
            value={staffRole}
            onChange={(e) => setStaffRole(e.target.value)}
          >
            {CONTROL_ROLES.map((r) => (
              <option key={r} value={r}>{CONTROL_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button className={styles.addStaffSubmit} type="submit" disabled={!staffName.trim() || savingStaff}>
            {savingStaff ? 'Guardando...' : 'Agregar'}
          </button>
        </form>
      )}

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
                  <td className={styles.role}>{CONTROL_ROLE_LABELS[f.role] ?? f.role ?? '—'}</td>
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
