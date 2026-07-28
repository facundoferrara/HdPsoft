import { useState } from 'react'
import AdminGuard from '../components/shared/AdminGuard'
import GearCheck from '../components/admin/GearCheck'
import Scheduler from '../components/admin/Scheduler'
import ResultsForm from '../components/admin/ResultsForm'
import InfractionsPanel from '../components/admin/InfractionsPanel'
import RoundProjection from '../components/admin/RoundProjection'
import BreakPopup from '../components/admin/BreakPopup'
import { setEventBreak, resumeEvent } from '../firebase/writes'
import { useEventStatus } from '../hooks/useEventStatus'
import styles from './Admin.module.css'

const TABS = [
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'results', label: 'Resultados' },
  { id: 'infractions', label: 'Infracciones' },
  { id: 'gear', label: 'Gear Check' },
]

function AdminLayout() {
  const [activeTab, setActiveTab] = useState('scheduler')
  const [showBreakPopup, setShowBreakPopup] = useState(false)
  const { eventStatus } = useEventStatus()

  const isBreak = eventStatus?.status === 'break'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>HDP 2026</span>
        <nav className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.headerRight}>
          {isBreak ? (
            <button className={`${styles.pauseBtn} ${styles.resumeBtn}`} onClick={resumeEvent}>
              ▶ Reanudar
            </button>
          ) : (
            <button className={styles.pauseBtn} onClick={() => setEventBreak(null)}>
              ⏸ Pausa
            </button>
          )}
        </div>
      </header>

      {isBreak && (
        <div className={styles.breakBanner}>
          ⏸ Evento en pausa
          {eventStatus.break_ends_at && (
            <span className={styles.breakTime}>
              · hasta las {new Date(eventStatus.break_ends_at.toMillis()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      <main className={styles.content}>
        {activeTab === 'scheduler' && (
          <>
            <RoundProjection />
            <Scheduler onRoundComplete={() => setShowBreakPopup(true)} />
          </>
        )}
        {activeTab === 'results' && <ResultsForm />}
        {activeTab === 'infractions' && <InfractionsPanel />}
        {activeTab === 'gear' && <GearCheck />}
      </main>

      {showBreakPopup && <BreakPopup onClose={() => setShowBreakPopup(false)} />}
    </div>
  )
}

export default function Admin() {
  return (
    <AdminGuard>
      <AdminLayout />
    </AdminGuard>
  )
}

