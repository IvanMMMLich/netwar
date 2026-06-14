import React, { useState, useEffect, useCallback } from 'react'
import { TUTORIAL, TutStep } from '../data/tutorialData'

const LS = 'netwar_tutorial'

export default function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ch, setCh] = useState(0)
  const [st, setSt] = useState(0)

  // listen for player actions to auto-advance TASK steps
  useEffect(() => {
    if (!open) return
    const step = TUTORIAL[ch]?.steps[st]
    if (!step || step.type !== 'TASK') return
    const onAction = (e: Event) => {
      const a = (e as CustomEvent).detail?.action
      const matches =
        (step.task === 'addNode' && a === 'addNode') ||
        (step.task === 'addDns' && a === 'addNode') ||
        (step.task === 'addEdge' && a === 'addEdge') ||
        (step.task === 'run' && a === 'run') ||
        (step.task === 'check' && a === 'check') ||
        (step.task === 'tspuMode' && a === 'tspuMode') ||
        (step.task === 'blocked' && a === 'blocked') ||
        (step.task === 'vpnTunneled' && a === 'vpnTunneled')
      if (matches) next()
    }
    window.addEventListener('netwar-action', onAction)
    return () => window.removeEventListener('netwar-action', onAction)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const totalSteps = TUTORIAL[ch].steps.length
  const step: TutStep = TUTORIAL[ch].steps[st]

  const next = useCallback(() => {
    if (st < TUTORIAL[ch].steps.length - 1) setSt(st + 1)
    else if (ch < TUTORIAL.length - 1) { setCh(ch + 1); setSt(0) }
    else { localStorage.setItem(LS, 'done'); onClose() }
  }, [ch, st, onClose])

  const back = useCallback(() => {
    if (st > 0) setSt(st - 1)
    else if (ch > 0) { setCh(ch - 1); setSt(TUTORIAL[ch - 1].steps.length - 1) }
  }, [ch, st])

  if (!open) return null
  const isLast = ch === TUTORIAL.length - 1 && st === totalSteps - 1
  const progress = (ch + (st + 1) / totalSteps) / TUTORIAL.length

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#070b14b3', zIndex: 1600,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 600, minHeight: 400, background: '#0d1424', border: '2px solid #00e676',
        boxShadow: '0 0 30px #00e67633', padding: '20px 26px', fontFamily: '"Share Tech Mono", monospace',
        display: 'flex', flexDirection: 'column' }}>
        {/* progress */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8, color: '#5a7090' }}>
            Глава {ch + 1}/{TUTORIAL.length}: {TUTORIAL[ch].title}
          </span>
          <button onClick={() => { localStorage.setItem(LS, 'done'); onClose() }}
            style={{ background: 'none', border: '1px solid #1e2d4a', color: '#5a7090', width: 24, height: 24, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ height: 6, background: '#1e2d4a', marginBottom: 18 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: '#00e676', transition: 'width .2s' }} />
        </div>

        {/* type badge */}
        <span style={{ alignSelf: 'flex-start', fontFamily: '"Share Tech Mono", monospace', fontSize: 9,
          color: step.type === 'TASK' ? '#ffb300' : step.type === 'DEMO' ? '#00b4ff' : '#5a7090',
          border: `1px solid ${step.type === 'TASK' ? '#ffb300' : step.type === 'DEMO' ? '#00b4ff' : '#1e2d4a'}`,
          padding: '2px 8px', marginBottom: 12 }}>{step.type}</span>

        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 11, color: '#00e676', marginBottom: 14 }}>
          {step.title}
        </div>

        {step.ascii && (
          <pre style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#00b4ff',
            background: '#0a0f1e', border: '1px solid #1e2d4a', padding: 10, overflowX: 'auto', lineHeight: 1.5, marginBottom: 14 }}>
            {step.ascii}
          </pre>
        )}

        <div style={{ fontSize: 13, color: '#c8d8f0', lineHeight: 1.8, flex: 1 }}>{step.text}</div>

        {step.type === 'DEMO' && step.demo && (
          <div style={{ fontSize: 11, color: '#00b4ff', marginTop: 10 }}>👁 Смотри: {step.demo === 'toolbar' ? 'панель слева' : step.demo === 'hud' ? 'HUD справа вверху' : `узел [${step.demo}]`}</div>
        )}
        {step.type === 'TASK' && step.taskHint && (
          <div style={{ fontSize: 12, color: '#ffb300', marginTop: 10 }}>↓ Попробуй сам: {step.taskHint}</div>
        )}

        {/* nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <Btn label="← Назад" color="#5a7090" onClick={back} disabled={ch === 0 && st === 0} />
          <span style={{ fontSize: 10, color: '#4a6a8a' }}>шаг {st + 1} из {totalSteps}</span>
          <Btn label={isLast ? '✓ Начать игру' : 'Далее →'} color={isLast ? '#ffb300' : '#00e676'} onClick={next} />
        </div>
      </div>
    </div>
  )
}

function Btn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, padding: '8px 14px',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        background: h && !disabled ? `${color}18` : 'transparent', border: `1.5px solid ${color}`, color }}>{label}</button>
  )
}

export function tutorialSeen(): boolean { return localStorage.getItem(LS) === 'done' }
