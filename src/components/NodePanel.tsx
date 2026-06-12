import React from 'react'
import { useStore } from '../store'
import { NODE_COLOR, NODE_FULL_LABEL, NODE_TYPE_MAP, NODE_MAP } from '../data/topology'
import { NODE_CAPABILITY, NODE_ENCAP } from '../data/nodeInfo'

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

function Matryoshka({ encap }: { encap: import('../data/nodeInfo').NodeEncap }) {
  // Render layers as nested boxes, innermost last.
  const renderLayer = (i: number): React.ReactNode => {
    if (i >= encap.layers.length) return null
    const l = encap.layers[i]
    const frame = l.encrypted ? '#9c6bff' : l.danger ? COL.red : l.sees ? COL.green : '#2a3a4a'
    const txt   = l.encrypted ? '#9c6bff' : l.danger ? COL.red : l.sees ? COL.text : '#3a4a5a'
    return (
      <div style={{ border: `1px solid ${frame}`, borderRadius: 2, padding: '5px 7px',
        marginTop: 4, background: l.encrypted ? '#9c6bff10' : l.sees ? `${frame}08` : 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6,
          fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: txt }}>
          <span>{l.label}</span>
          <span style={{ color: frame, flexShrink: 0 }}>
            {l.encrypted ? '[ШИФР]' : l.sees ? '[ВИДИТ]' : '[СЛЕПОЙ]'}
          </span>
        </div>
        {l.detail?.map((d, j) => (
          <div key={j} style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 9,
            color: l.danger ? '#ff8888' : '#5a7090', paddingLeft: 8, lineHeight: '1.5' }}>
            └ {d}
          </div>
        ))}
        {renderLayer(i + 1)}
      </div>
    )
  }
  return (
    <div>
      {renderLayer(0)}
      <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, color: COL.dim,
        lineHeight: '1.7', marginTop: 8, borderLeft: `2px solid ${COL.blue}`, paddingLeft: 8 }}>
        {encap.explanation}
      </div>
    </div>
  )
}

interface NodePanelProps {
  nodeStats: Map<string, { passed: number; blocked: number }>
  tspuBlocked: number
}

export default function NodePanel({ nodeStats, tspuBlocked }: NodePanelProps) {
  const { selectedNodeId, setSelectedNode } = useStore()
  if (!selectedNodeId) return null

  const node = NODE_MAP.get(selectedNodeId)
  const type = NODE_TYPE_MAP.get(selectedNodeId)
  if (!node || !type) return null

  const color = NODE_COLOR[type]
  const cap   = NODE_CAPABILITY[type]
  const stats = nodeStats.get(selectedNodeId) ?? { passed: 0, blocked: 0 }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 300, height: '100vh',
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
            fontFamily: '"Press Start 2P", cursive', fontSize: node.label.length > 3 ? 7 : 9, color,
            boxShadow: `0 0 8px ${color}55`,
          }}>{node.label}</div>
          <div>
            <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 10, color,
              textShadow: `0 0 8px ${color}` }}>
              {NODE_FULL_LABEL[type]}
            </div>
            <div style={{ fontSize: 10, color: COL.dim, marginTop: 4 }}>
              {node.sublabel}
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

      {NODE_ENCAP[type] && (
        <Section title="📦 ИНКАПСУЛЯЦИЯ">
          <Matryoshka encap={NODE_ENCAP[type]!} />
        </Section>
      )}

      {type === 'ТСПУ' && (
        <Section title="👁 DPI МОНИТОР">
          <Row icon="›" text="СЕЙЧАС ЧИТАЕТ: IP / SNI / DNS-запросы" color={COL.amber} />
          <Row icon="›" text={`ЗАБЛОКИРОВАНО СЕГОДНЯ: ${tspuBlocked}`} color={COL.red} />
        </Section>
      )}

      <Section title="📊 СТАТУС">
        <Row icon="›" text={`Пакетов прошло:    ${stats.passed}`}   color={COL.green} />
        <Row icon="›" text={`Заблокировано:     ${stats.blocked}`} color={COL.red} />
      </Section>
    </div>
  )
}
