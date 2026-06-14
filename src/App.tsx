import React, { useState, useCallback } from 'react'
import NetworkGraph from './NetworkGraph'
import NodePanel from './components/NodePanel'
import ScenarioPanel from './components/ScenarioPanel'
import ModeSwitcher from './components/ModeSwitcher'
import Sandbox from './components/Sandbox'
import EconomyHUD from './components/EconomyHUD'
import EventSystem from './components/EventSystem'
import LayersPanel from './components/LayersPanel'
import HistoryView from './components/HistoryView'
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
  const layersMode = useStore(s => s.layersMode)
  const branch = useStore(s => s.repository.currentBranch)
  const isTopology = mode === 'topology'
  const onMain = branch === 'main'

  return (
    <div className="scanlines relative min-h-screen w-full bg-bg overflow-hidden">
      {/* TOPOLOGY — kept mounted so its state persists when hidden */}
      <div className="absolute inset-0"
        style={{ display: isTopology ? 'block' : 'none',
                 right: panelOpen && isTopology ? PANEL_WIDTH : 0, transition: 'right 0.25s ease' }}>
        <NetworkGraph onNodeStats={handleNodeStats} onTspuBlocked={handleTspu} />
      </div>

      {/* SANDBOX — kept mounted so the canvas persists across switches */}
      <div style={{ display: mode === 'sandbox' ? 'block' : 'none' }}>
        <Sandbox />
      </div>

      {mode === 'history' && <HistoryView />}

      <ModeSwitcher />

      <div style={{ ...HUD, top: 16, left: 16, color: '#00e676',
        textShadow: '0 0 8px #00e676, 0 0 16px #00e67666', display: 'flex', gap: 10, alignItems: 'center' }}>
        SYS::NETWAR v0.5.0
        <span style={{ fontSize: 11, color: onMain ? '#00e676' : '#ffb300',
          border: `1px solid ${onMain ? '#00e67655' : '#ffb30055'}`, padding: '1px 7px' }}>
          {branch} ●
        </span>
      </div>
      <div style={{ ...HUD, top: 16, right: panelOpen && isTopology ? PANEL_WIDTH + 16 : 16, color: '#00b4ff',
        textShadow: '0 0 8px #00b4ff, 0 0 16px #00b4ff66', transition: 'right 0.25s ease' }}>
        STATUS::ONLINE
      </div>

      <EconomyHUD />
      {isTopology && <EventSystem />}

      {isTopology && !layersMode && <NodePanel nodeStats={nodeStats} tspuBlocked={tspuBlocked} />}
      <LayersPanel />
      <ScenarioPanel />
    </div>
  )
}
