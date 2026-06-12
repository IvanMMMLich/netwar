import React from 'react'
import NetworkGraph from './NetworkGraph'

const HUD_STYLE: React.CSSProperties = {
  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 13,
  letterSpacing: '0.2em',
  pointerEvents: 'none',
  position: 'absolute',
}

const green: React.CSSProperties = {
  color: '#00e676',
  textShadow: '0 0 8px #00e676, 0 0 16px #00e67666',
}

const blue: React.CSSProperties = {
  color: '#00b4ff',
  textShadow: '0 0 8px #00b4ff, 0 0 16px #00b4ff66',
}

const purple: React.CSSProperties = {
  color: '#9c6bff',
  textShadow: '0 0 8px #9c6bff, 0 0 16px #9c6bff66',
}

export default function App() {
  return (
    <div className="scanlines relative min-h-screen w-full bg-bg overflow-hidden">
      <div className="absolute inset-0">
        <NetworkGraph />
      </div>

      <div style={{ ...HUD_STYLE, ...green, top: 16, left: 16 }}>
        SYS::NETWAR v0.1.0
      </div>
      <div style={{ ...HUD_STYLE, ...blue, top: 16, right: 16 }}>
        STATUS::ONLINE
      </div>
      <div style={{ ...HUD_STYLE, ...purple, bottom: 16, left: 16 }}>
        NODES::8&nbsp;&nbsp;EDGES::10
      </div>
      <div style={{ ...HUD_STYLE, ...green, bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
        GRID::ACTIVE
      </div>
    </div>
  )
}
