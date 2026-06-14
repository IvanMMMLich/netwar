import React, { useState } from 'react'
import { useStore } from '../store'

const C = {
  panel: '#070b14', border: '#1e2d4a',
  green: '#00e676', blue: '#00b4ff', amber: '#ffb300', purple: '#9c6bff',
}

function Btn({ children, active, glow = C.green, onClick }: {
  children: React.ReactNode; active?: boolean; glow?: string; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  const lit = hov || active
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10,
        background: lit ? `${glow}18` : '#0d1424',
        border: `1.5px solid ${lit ? glow : C.border}`,
        boxShadow: lit ? `0 0 10px ${glow}55` : 'none',
        color: lit ? glow : '#7a9ab8', padding: '0 14px', height: 40,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s', userSelect: 'none', whiteSpace: 'nowrap', letterSpacing: '0.05em',
      }}>{children}</button>
  )
}

function ZoomBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 16, background: '#0d1424',
        border: `1.5px solid ${!disabled && hov ? C.green : C.border}`,
        boxShadow: !disabled && hov ? '0 0 10px #00e67644' : 'none',
        color: disabled ? '#2a3a4a' : hov ? C.green : '#c8d8f0',
        width: 48, height: 48, cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s', userSelect: 'none', flexShrink: 0,
      }}>{label}</button>
  )
}

interface Props {
  zoom: number; onZoom: (d: number) => void; onFit: () => void
  onToggleOspf: () => void; ospfActive: boolean
}

export default function ControlBar({ zoom, onZoom, onFit, onToggleOspf, ospfActive }: Props) {
  const { paused, setPaused, speed, cycleSpeed, setScenarioPanelOpen, layersMode, setLayersMode } = useStore()
  const div = { width: 1, height: 28, background: C.border, flexShrink: 0 } as const

  return (
    <>
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', zIndex: 60 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
          <Btn onClick={() => setPaused(!paused)} active={paused} glow={paused ? C.amber : C.green}>
            {paused ? '▶ PLAY' : '⏸ PAUSE'}
          </Btn>
          <div style={div} />
          <Btn onClick={cycleSpeed} glow={C.blue}>{speed}x</Btn>
          <div style={div} />
          <Btn onClick={onToggleOspf} active={ospfActive} glow={C.green}>OSPF</Btn>
          <div style={div} />
          <Btn onClick={() => setLayersMode(!layersMode)} active={layersMode} glow={C.amber}>СЛОИ</Btn>
          <div style={div} />
          <Btn onClick={onFit} glow={C.blue}>⊡ FIT</Btn>
          <div style={div} />
          <Btn onClick={() => setScenarioPanelOpen(true)} glow={C.purple}>SCENARIOS</Btn>
        </div>
      </div>

      <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 50 }}>
        <ZoomBtn label="+" disabled={zoom >= 2} onClick={() => onZoom(0.1)} />
        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 12, color: '#7a9ab8',
          background: '#0d1424', border: `1.5px solid ${C.border}`, width: 48, height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none', letterSpacing: '-0.04em' }}>{zoom.toFixed(1)}</div>
        <ZoomBtn label="−" disabled={zoom <= 0.5} onClick={() => onZoom(-0.1)} />
      </div>
    </>
  )
}
