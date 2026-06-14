import React, { useState } from 'react'
import { useStore } from '../store'

const GREEN = '#00e676'
const BORDER = '#1e2d4a'

function ModeButton({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: '"Press Start 2P", cursive',
        fontSize: 9,
        letterSpacing: '0.05em',
        padding: '8px 16px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all .15s',
        background: active ? GREEN : 'transparent',
        color: active ? '#070b14' : hov ? '#c8d8f0' : '#5a7090',
        border: `1px solid ${active ? GREEN : hov ? GREEN : BORDER}`,
        boxShadow: active ? `0 0 10px ${GREEN}66` : 'none',
      }}
    >
      {label}
    </button>
  )
}

export default function ModeSwitcher() {
  const mode = useStore(s => s.mode)
  const setMode = useStore(s => s.setMode)
  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 400, display: 'flex', gap: 0,
      background: '#070b14', border: `1px solid ${BORDER}`, padding: 4,
    }}>
      <ModeButton label="TOPOLOGY" active={mode === 'topology'} onClick={() => setMode('topology')} />
      <ModeButton label="SANDBOX"  active={mode === 'sandbox'}  onClick={() => setMode('sandbox')} />
    </div>
  )
}
