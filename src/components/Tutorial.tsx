import React, { useState, useEffect, useCallback } from 'react'
import { TUTORIAL, TutStep } from '../data/tutorialData'
import { SFX } from '../services/sfx'

const LS = 'netwar_tutorial'
export const TUTORIAL_WIDTH = 320

export default function Tutorial({ open, collapsed, onToggleCollapse, onClose }: {
  open: boolean; collapsed: boolean; onToggleCollapse: () => void; onClose: () => void
}) {
  const [ch, setCh] = useState(0)
  const [st, setSt] = useState(0)
  const [done, setDone] = useState(false)   // "✓ Выполнено!" flash for TASK

  const totalSteps = open ? TUTORIAL[ch].steps.length : 0
  const step: TutStep | undefined = open ? TUTORIAL[ch].steps[st] : undefined

  const next = useCallback(() => {
    SFX.TUTORIAL_NEXT()
    if (st < TUTORIAL[ch].steps.length - 1) setSt(st + 1)
    else if (ch < TUTORIAL.length - 1) { setCh(ch + 1); setSt(0) }
    else { localStorage.setItem(LS, 'done'); SFX.TUTORIAL_COMPLETE(); onClose() }
  }, [ch, st, onClose])

  const back = useCallback(() => {
    if (st > 0) setSt(st - 1)
    else if (ch > 0) { setCh(ch - 1); setSt(TUTORIAL[ch - 1].steps.length - 1) }
  }, [ch, st])

  // TASK auto-advance with "✓ Выполнено!" flash
  useEffect(() => {
    if (!open || !step || step.type !== 'TASK') { setDone(false); return }
    const onAction = (e: Event) => {
      const a = (e as CustomEvent).detail?.action
      const t = step.task
      const ok = (t === 'addNode' && a === 'addNode') || (t === 'addDns' && a === 'addNode') ||
        (t === 'addEdge' && a === 'addEdge') || (t === 'run' && a === 'run') || (t === 'check' && a === 'check') ||
        (t === 'tspuMode' && a === 'tspuMode') || (t === 'blocked' && a === 'blocked') || (t === 'vpnTunneled' && a === 'vpnTunneled')
      if (ok && !done) { setDone(true); setTimeout(() => next(), 900) }
    }
    window.addEventListener('netwar-action', onAction)
    return () => window.removeEventListener('netwar-action', onAction)
  }) // eslint-disable-line

  if (!open) return null
  const isLast = ch === TUTORIAL.length - 1 && st === totalSteps - 1
  const progress = (ch + (st + 1) / totalSteps) / TUTORIAL.length

  // collapsed → vertical mini-tab
  if (collapsed) {
    return (
      <div onClick={onToggleCollapse} style={{ position: 'fixed', top: 70, right: 0, width: 32, zIndex: 1500,
        background: '#0d1424', border: '1px solid #00e676', borderRight: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8 }}>
        <span style={{ fontSize: 16 }}>📖</span>
        <div style={{ width: 4, height: 120, background: '#1e2d4a' }}>
          <div style={{ width: '100%', height: `${progress * 100}%`, background: '#00e676' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: TUTORIAL_WIDTH, height: '100vh', zIndex: 1500,
      background: '#0d1424', borderLeft: '2px solid #00e676', boxShadow: '-8px 0 24px #00e67622',
      display: 'flex', flexDirection: 'column', fontFamily: '"Share Tech Mono", monospace' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #1e2d4a' }}>
        <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#00e676' }}>📖 ТУТОРИАЛ</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <HBtn label="—" onClick={onToggleCollapse} />
          <HBtn label="✕" onClick={() => { localStorage.setItem(LS, 'done'); onClose() }} />
        </div>
      </div>
      {/* progress */}
      <div style={{ padding: '10px 14px 6px' }}>
        <div style={{ fontSize: 9, color: '#5a7090', marginBottom: 4 }}>Глава {ch + 1}/{TUTORIAL.length}: {TUTORIAL[ch].title}</div>
        <div style={{ height: 6, background: '#1e2d4a' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: '#00e676', transition: 'width .2s' }} />
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        <span style={{ display: 'inline-block', fontSize: 9, marginBottom: 10,
          color: step!.type === 'TASK' ? '#ffb300' : step!.type === 'DEMO' ? '#00b4ff' : '#5a7090',
          border: `1px solid ${step!.type === 'TASK' ? '#ffb300' : step!.type === 'DEMO' ? '#00b4ff' : '#1e2d4a'}`, padding: '2px 8px' }}>{step!.type}</span>
        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color: '#00e676', marginBottom: 12, lineHeight: 1.5 }}>{step!.title}</div>
        {step!.ascii && (
          <pre style={{ fontSize: 10, color: '#00b4ff', background: '#0a0f1e', border: '1px solid #1e2d4a', padding: 8, overflowX: 'auto', lineHeight: 1.45, marginBottom: 12 }}>{step!.ascii}</pre>
        )}
        <div style={{ fontSize: 12, color: '#c8d8f0', lineHeight: 1.7 }}>{step!.text}</div>
        {step!.type === 'DEMO' && step!.demo && (
          <div style={{ fontSize: 11, color: '#00b4ff', marginTop: 10 }}>👁 Смотри: {step!.demo === 'toolbar' ? 'панель слева ←' : step!.demo === 'hud' ? 'HUD справа вверху ↗' : `узел [${step!.demo}] на холсте`}</div>
        )}
        {step!.type === 'TASK' && (
          done
            ? <div style={{ fontSize: 13, color: '#00e676', marginTop: 12, fontFamily: '"Press Start 2P", cursive' }}>✓ Выполнено!</div>
            : <div style={{ fontSize: 12, color: '#ffb300', marginTop: 12, animation: 'cursor-dot 1s ease-in-out infinite' }}>⬇ Выполни задание на холсте{step!.taskHint ? `: ${step!.taskHint}` : ''}</div>
        )}
      </div>

      {/* nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid #1e2d4a' }}>
        <NBtn label="← Назад" color="#5a7090" onClick={back} disabled={ch === 0 && st === 0} />
        <span style={{ fontSize: 10, color: '#4a6a8a' }}>{st + 1}/{totalSteps}</span>
        <NBtn label={isLast ? '✓ Готово' : 'Далее →'} color={isLast ? '#ffb300' : '#00e676'} onClick={next} />
      </div>
    </div>
  )
}

function HBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ background: 'none', border: '1px solid #1e2d4a', color: '#5a7090', width: 22, height: 22, cursor: 'pointer', fontSize: 11 }}>{label}</button>
}
function NBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  const [h, setH] = useState(false)
  return <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8, padding: '8px 12px', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1, background: h && !disabled ? `${color}18` : 'transparent', border: `1.5px solid ${color}`, color }}>{label}</button>
}

export function tutorialSeen(): boolean { return localStorage.getItem(LS) === 'done' }
