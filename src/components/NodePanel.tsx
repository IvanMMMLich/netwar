import React from 'react'
import { useStore } from '../store'
import { NODE_COLOR, NODE_LABEL, NODE_FULL_LABEL, NODE_TYPE_MAP } from '../data/topology'
import { NODE_CAPABILITY } from '../data/nodeInfo'

const COL = {
  bg:      '#070b14',
  panel:   '#0d1424',
  border:  '#1e2d4a',
  green:   '#00e676',
  blue:    '#00b4ff',
  red:     '#ff4444',
  amber:   '#ffb300',
  text:    '#c8d8f0',
  dim:     '#4a6a8a',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8,
        color: COL.dim, letterSpacing: '0.1em', marginBottom: 8,
        borderBottom: `1px solid ${COL.border}`, paddingBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontFamily: '"Share Tech Mono", monospace',
      fontSize: 11, lineHeight: '1.8', color }}>
      <span style={{ flexShrink: 0, width: 12 }}>{icon}</span>
      <span>{text}</span>
    </div>
  )
}

interface NodePanelProps {
  nodeStats: Map<string, { passed: number; blocked: number }>
}

export default function NodePanel({ nodeStats }: NodePanelProps) {
  const { selectedNodeId, setSelectedNode } = useStore()
  if (!selectedNodeId) return null

  const type = NODE_TYPE_MAP.get(selectedNodeId)
  if (!type) return null

  const color = NODE_COLOR[type]
  const cap   = NODE_CAPABILITY[type]
  const stats = nodeStats.get(selectedNodeId) ?? { passed: 0, blocked: 0 }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 340, height: '100vh',
      background: COL.panel, borderLeft: `2px solid ${color}`,
      boxShadow: `-8px 0 24px ${color}22`,
      zIndex: 500, overflowY: 'auto', padding: '16px 20px',
      fontFamily: '"Share Tech Mono", monospace',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, border: `2px solid ${color}`, background: `${color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Press Start 2P", cursive', fontSize: 9, color,
            boxShadow: `0 0 8px ${color}55`,
          }}>{NODE_LABEL[type]}</div>
          <div>
            <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color,
              textShadow: `0 0 8px ${color}` }}>
              {NODE_FULL_LABEL[type]}
            </div>
            <div style={{ fontSize: 10, color: COL.dim, marginTop: 4 }}>
              {selectedNodeId}
            </div>
          </div>
        </div>
        <button onClick={() => setSelectedNode(null)}
          style={{ background: 'none', border: `1px solid ${COL.border}`, color: COL.dim,
            width: 28, height: 28, cursor: 'pointer', fontFamily: '"Press Start 2P", cursive',
            fontSize: 10 }}>✕</button>
      </div>

      <Section title="✓  МОЖЕТ">
        {cap.can.map((t, i) => <Row key={i} icon="✓" text={t} color={COL.green} />)}
      </Section>

      <Section title="✗  НЕ МОЖЕТ">
        {cap.cannot.map((t, i) => <Row key={i} icon="✗" text={t} color={COL.red} />)}
      </Section>

      <Section title="⚡ ПРОТОКОЛЫ">
        {cap.protocols.map((t, i) => <Row key={i} icon="›" text={t} color={COL.blue} />)}
      </Section>

      <Section title="📊 СТАТУС">
        <Row icon="›" text={`Пакетов прошло:    ${stats.passed}`}   color={COL.green} />
        <Row icon="›" text={`Пакетов заблокировано: ${stats.blocked}`} color={COL.red} />
      </Section>
    </div>
  )
}
