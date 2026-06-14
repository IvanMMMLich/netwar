import React, { useState, useCallback } from 'react'
import NetworkGraph from './NetworkGraph'
import NodePanel from './components/NodePanel'
import ScenarioPanel from './components/ScenarioPanel'
import ModeSwitcher from './components/ModeSwitcher'
import Sandbox from './components/Sandbox'
import { useStore } from './store'

const PANEL_WIDTH = 300

const HUD: React.CSSProperties = {
  fontFamily: '"Share Tech Mono", monospace',
  fontSize: 13, letterSpacing: '0.18em',
  pointerEvents: 'none', position: 'absolute',
}

export default function App() {
  const [nodeStats, setNodeStats] = useState<Map<string, { passed: number; blocked: number }>>(new Map())
  const [tspuBlocked, setTspuBlocked] = useState(0)
  const handleNodeStats = useCallback((s: Map<string, { passed: number; blocked: number }>) => setNodeStats(s), [])
  const handleTspu = useCallback((n: number) => setTspuBlocked(n), [])
  const panelOpen = useStore(s => s.selectedNodeId !== null)
  const mode = useStore(s => s.mode)
  const isTopology = mode === 'topology'

  return (
    <div className="scanlines relative min-h-screen w-full bg-bg overflow-hidden">
      {/* TOPOLOGY — kept mounted so its state persists when hidden */}
      <div className="absolute inset-0"
        style={{ display: isTopology ? 'block' : 'none',
                 right: panelOpen && isTopology ? PANEL_WIDTH : 0, transition: 'right 0.25s ease' }}>
        <NetworkGraph onNodeStats={handleNodeStats} onTspuBlocked={handleTspu} />
      </div>

      {/* SANDBOX */}
      {!isTopology && <Sandbox />}

      <ModeSwitcher />

      <div style={{ ...HUD, top: 16, left: 16, color: '#00e676',
        textShadow: '0 0 8px #00e676, 0 0 16px #00e67666' }}>
        SYS::NETWAR v0.4.0
      </div>
      <div style={{ ...HUD, top: 16, right: panelOpen && isTopology ? PANEL_WIDTH + 16 : 16, color: '#00b4ff',
        textShadow: '0 0 8px #00b4ff, 0 0 16px #00b4ff66', transition: 'right 0.25s ease' }}>
        STATUS::ONLINE
      </div>

      {isTopology && <NodePanel nodeStats={nodeStats} tspuBlocked={tspuBlocked} />}
      <ScenarioPanel />
    </div>
  )
}
