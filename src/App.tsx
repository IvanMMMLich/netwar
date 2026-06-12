import React, { useState, useCallback } from 'react'
import NetworkGraph from './NetworkGraph'
import NodePanel from './components/NodePanel'
import ScenarioPanel from './components/ScenarioPanel'

const HUD: React.CSSProperties = {
  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 13, letterSpacing: '0.18em',
  pointerEvents: 'none', position: 'absolute',
}

export default function App() {
  const [nodeStats, setNodeStats] = useState<Map<string, { passed: number; blocked: number }>>(new Map())
  const handleNodeStats = useCallback((s: Map<string, { passed: number; blocked: number }>) => setNodeStats(s), [])

  return (
    <div className="scanlines relative min-h-screen w-full bg-bg overflow-hidden">
      <div className="absolute inset-0">
        <NetworkGraph onNodeStats={handleNodeStats} />
      </div>

      <div style={{ ...HUD, top: 16, left: 16, color: '#00e676',
        textShadow: '0 0 8px #00e676, 0 0 16px #00e67666' }}>
        SYS::NETWAR v0.2.0
      </div>
      <div style={{ ...HUD, top: 16, right: 16, color: '#00b4ff',
        textShadow: '0 0 8px #00b4ff, 0 0 16px #00b4ff66' }}>
        STATUS::ONLINE
      </div>

      <NodePanel nodeStats={nodeStats} />
      <ScenarioPanel />
    </div>
  )
}
