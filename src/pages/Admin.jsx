import { useState } from 'react'
import AdminGuard from '../components/shared/AdminGuard'
import GearCheck from '../components/admin/GearCheck'
import Scheduler from '../components/admin/Scheduler'
import ResultsForm from '../components/admin/ResultsForm'
import InfractionsPanel from '../components/admin/InfractionsPanel'
import CuttingManager from '../components/admin/CuttingManager'
import RoundProjection from '../components/admin/RoundProjection'
import BreakPopup from '../components/admin/BreakPopup'
import EventClock from '../components/admin/EventClock'
import { setEventBreak, resumeEvent, resetTournament } from '../firebase/writes'
import { useEventStatus } from '../hooks/useEventStatus'
import styles from './Admin.module.css'

const TABS = [
  { id: 'scheduler', label: 'Organizador' },
  { id: 'results', label: 'Resultados' },
  { id: 'infractions', label: 'Infracciones' },
  { id: 'gear', label: 'Padrón' },
  { id: 'cutting', label: 'Corte' },
]

function AdminLayout() {
  const [activeTab, setActiveTab] = useState('scheduler')
  const [showBreakPopup, setShowBreakPopup] = useState(false)
  const [showDisplay, setShowDisplay] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
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
          <EventClock />
          <button
            className={`${styles.displayBtn} ${showDisplay ? styles.displayBtnActive : ''}`}
            onClick={() => setShowDisplay((v) => !v)}
          >
            📺 Display
          </button>
          <button className={styles.resetBtn} onClick={() => setShowResetConfirm(true)}>
            Reiniciar torneo
          </button>
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
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <RoundProjection />
            <Scheduler onRoundComplete={() => setShowBreakPopup(true)} />
          </div>
        )}
        {activeTab === 'results' && <ResultsForm />}
        {activeTab === 'infractions' && <div style={{ height: '100%', overflowY: 'auto' }}><InfractionsPanel /></div>}
        {activeTab === 'gear' && <div style={{ height: '100%', overflowY: 'auto' }}><GearCheck /></div>}
        {activeTab === 'cutting' && <CuttingManager />}
      </main>

      {showBreakPopup && <BreakPopup onClose={() => setShowBreakPopup(false)} />}

      {showResetConfirm && (
        <div className={styles.resetOverlay}>
          <div className={styles.resetDialog}>
            <h3 className={styles.resetTitle}>Reiniciar torneo</h3>
            <p className={styles.resetText}>
              Se eliminarán todas las rondas, resultados e infracciones. El padrón de tiradores NO se modifica.
            </p>
            <p className={styles.resetWarning}>Esta acción no se puede deshacer.</p>
            <div className={styles.resetActions}>
              <button
                className={styles.resetCancel}
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
              >
                Cancelar
              </button>
              <button
                className={styles.resetConfirm}
                disabled={resetting}
                onClick={async () => {
                  setResetting(true)
                  try {
                    await resetTournament()
                  } finally {
                    setResetting(false)
                    setShowResetConfirm(false)
                  }
                }}
              >
                {resetting ? 'Reiniciando…' : 'Sí, reiniciar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisplay && (
        <div className={styles.displayPanel}>
          <div className={styles.displayPanelHeader}>
            <span>Vista TV</span>
            <button className={styles.displayPanelClose} onClick={() => setShowDisplay(false)}>✕</button>
          </div>
          <iframe src="/display" className={styles.displayIframe} title="Display preview" />
        </div>
      )}
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

