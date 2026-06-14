import React, { useState } from 'react'
import { useStore } from '../store'
import { SaveCommit } from '../services/saveSystem'

export default function HistoryView() {
  const repository = useStore(s => s.repository)
  const setMode = useStore(s => s.setMode)
  const gitCheckout = useStore(s => s.gitCheckout)
  const gitBranch = useStore(s => s.gitBranch)
  const [sel, setSel] = useState<string | null>(null)

  const branchLane = new Map(repository.branches.map((b, i) => [b.name, i]))
  const branchColor = new Map(repository.branches.map(b => [b.name, b.color]))
  // chronological order
  const commits = [...repository.commits].sort((a, b) => a.timestamp - b.timestamp)
  const yOf = (hash: string) => 60 + commits.findIndex(c => c.hash === hash) * 64
  const xOf = (branch: string) => 80 + (branchLane.get(branch) ?? 0) * 90
  const selCommit = sel ? repository.commits.find(c => c.hash === sel) : null

  const loadState = (c: SaveCommit) => {
    gitCheckout(c.hash)
    window.dispatchEvent(new CustomEvent('netwar-load-state', { detail: c.state }))
    setMode('sandbox')
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#070b14', display: 'flex' }}>
      <svg width="100%" height="100%" style={{ flex: 1 }}>
        <defs>
          <pattern id="hgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0d1424" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hgrid)" />
        {commits.length === 0 && (
          <text x="50%" y="50%" textAnchor="middle" fill="#2a3a4a"
            fontFamily='"Share Tech Mono", monospace' fontSize="14" letterSpacing="0.2em">
            История пуста — сделай "save" в SANDBOX
          </text>
        )}
        {/* edges parent→child */}
        {commits.map(c => c.parentHash ? (
          <line key={`l${c.hash}`} x1={xOf(c.branch)} y1={yOf(c.hash)}
            x2={xOf((repository.commits.find(p => p.hash === c.parentHash)?.branch) ?? c.branch)} y2={yOf(c.parentHash)}
            stroke={branchColor.get(c.branch) ?? '#1e2d4a'} strokeWidth={2} opacity={0.6} />
        ) : null)}
        {/* commit nodes */}
        {commits.map(c => {
          const x = xOf(c.branch), y = yOf(c.hash), col = branchColor.get(c.branch) ?? '#00e676'
          const isHead = repository.head === c.hash
          return (
            <g key={c.hash} style={{ cursor: 'pointer' }} onClick={() => setSel(c.hash)}>
              <circle cx={x} cy={y} r={8} fill={sel === c.hash ? col : '#0d1424'} stroke={col} strokeWidth={2} />
              <text x={x + 16} y={y - 4} fill={col} fontFamily='"Share Tech Mono", monospace' fontSize="11">{c.hash}</text>
              <text x={x + 16} y={y + 10} fill="#7a9ab8" fontFamily='"Share Tech Mono", monospace' fontSize="10">
                {c.message.slice(0, 24)}
              </text>
              <text x={x + 260} y={y + 4} fill="#4a6a8a" fontFamily='"Share Tech Mono", monospace' fontSize="9">
                {new Date(c.timestamp).toLocaleTimeString().slice(0, 8)}
              </text>
              {isHead && <text x={x - 28} y={y + 4} fill="#00e676" fontFamily='"Share Tech Mono", monospace' fontSize="12">→</text>}
            </g>
          )
        })}
      </svg>

      {/* detail card */}
      {selCommit && (
        <div style={{ width: 300, flexShrink: 0, background: '#0d1424', borderLeft: '2px solid #1e2d4a',
          padding: '16px 18px', fontFamily: '"Share Tech Mono", monospace', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: branchColor.get(selCommit.branch) ?? '#00e676' }}>
            Коммит {selCommit.hash}
          </div>
          <div style={{ fontSize: 12, color: '#c8d8f0' }}>"{selCommit.message}"</div>
          {[['Ветка', selCommit.branch], ['Время', new Date(selCommit.timestamp).toLocaleTimeString()],
            ['Узлов', String(selCommit.state.nodes.length)], ['Рёбер', String(selCommit.state.edges.length)],
            ['Биты', selCommit.state.economy.bits.toLocaleString()]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
              <span style={{ color: '#4a6a8a', minWidth: 60 }}>{k}:</span><span style={{ color: '#c8d8f0' }}>{v}</span>
            </div>
          ))}
          <button onClick={() => loadState(selCommit)} style={btn('#00e676')}>▶ Загрузить это состояние</button>
          <button onClick={() => { gitCheckout(selCommit.hash); gitBranch(`branch-${selCommit.hash.slice(0, 4)}`); setMode('sandbox') }} style={btn('#9c6bff')}>
            🔀 Создать ветку отсюда
          </button>
        </div>
      )}
    </div>
  )
}

function btn(color: string): React.CSSProperties {
  return { fontFamily: '"Press Start 2P", cursive', fontSize: 8, padding: '10px', cursor: 'pointer',
    background: `${color}18`, border: `1.5px solid ${color}`, color, marginTop: 4, lineHeight: 1.4 }
}
