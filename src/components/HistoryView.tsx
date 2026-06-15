import React, { useState } from 'react'
import { useStore } from '../store'
import { SaveCommit } from '../services/saveSystem'
import { SFX } from '../services/sfx'

export default function HistoryView() {
  const repository = useStore(s => s.repository)
  const setMode = useStore(s => s.setMode)
  const gitCheckout = useStore(s => s.gitCheckout)
  const gitBranch = useStore(s => s.gitBranch)
  const gitMerge = useStore(s => s.gitMerge)
  const [sel, setSel] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  const branchLane = new Map(repository.branches.map((b, i) => [b.name, i]))
  const branchColor = new Map(repository.branches.map(b => [b.name, b.color]))
  const commits = [...repository.commits].sort((a, b) => a.timestamp - b.timestamp)
  const yOf = (hash: string) => 60 + commits.findIndex(c => c.hash === hash) * 64
  const xOf = (branch: string) => 60 + (branchLane.get(branch) ?? 0) * 90
  const selCommit = sel ? repository.commits.find(c => c.hash === sel) : null

  // PRs: non-main branches that have at least one commit
  const prs = repository.branches.filter(b => b.name !== 'main' && b.headHash)
    .map((b, i) => ({ id: i + 1, branch: b.name, commit: repository.commits.find(c => c.hash === b.headHash) }))
    .filter(pr => pr.commit)

  const loadState = (c: SaveCommit) => { gitCheckout(c.hash); window.dispatchEvent(new CustomEvent('netwar-load-state', { detail: c.state })); setMode('sandbox') }
  const doMerge = (branch: string) => { const r = gitMerge(branch); if (r.ok) { SFX.MERGE_SUCCESS(); setFlash(true); setTimeout(() => setFlash(false), 600) } }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#070b14', display: 'flex' }}>
      {flash && <div style={{ position: 'fixed', inset: 0, background: '#ffffff33', zIndex: 2000, pointerEvents: 'none', animation: 'sbflash .6s' }} />}

      {/* left panel: branches + PRs */}
      <div style={{ width: 300, flexShrink: 0, background: '#0d1424', borderRight: '1px solid #1e2d4a',
        overflowY: 'auto', padding: '14px 16px', fontFamily: '"Share Tech Mono", monospace' }}>
        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#00e676', marginBottom: 12 }}>ВЕТКИ</div>
        {repository.branches.map(b => {
          const c = repository.commits.find(x => x.hash === b.headHash)
          const isHead = repository.currentBranch === b.name
          return (
            <div key={b.name} style={{ marginBottom: 12, cursor: 'pointer' }}
              onClick={() => { if (c) { gitCheckout(c.hash); window.dispatchEvent(new CustomEvent('netwar-load-state', { detail: c.state })); } }}>
              <div style={{ fontSize: 12, color: b.color }}>
                {isHead ? '●' : '○'} {b.name} {isHead && <span style={{ color: '#00e676', fontSize: 10 }}>[HEAD]</span>}
              </div>
              {c && <div style={{ fontSize: 10, color: '#5a7090', paddingLeft: 14 }}>{c.hash} {c.message.slice(0, 22)}</div>}
            </div>
          )
        })}

        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: '#9c6bff', margin: '18px 0 12px',
          borderTop: '1px solid #1e2d4a', paddingTop: 14 }}>PULL REQUESTS</div>
        {prs.length === 0 && <div style={{ fontSize: 11, color: '#3a4a5a' }}>нет открытых PR — создай ветку</div>}
        {prs.map(pr => (
          <div key={pr.id} style={{ marginBottom: 12, border: '1px solid #1e2d4a', padding: '8px 10px' }}>
            <div style={{ fontSize: 11, color: '#c8d8f0' }}>#{pr.id} {pr.branch} → main</div>
            <div style={{ fontSize: 10, color: '#5a7090', margin: '2px 0' }}>
              {pr.commit!.state.nodes.length} узлов, {pr.commit!.state.edges.length} рёбер
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <MiniBtn label="Просмотр" color="#00b4ff" onClick={() => setSel(pr.commit!.hash)} />
              <MiniBtn label="Мерж" color="#00e676" onClick={() => doMerge(pr.branch)} />
            </div>
          </div>
        ))}
      </div>

      {/* commit graph */}
      <svg style={{ flex: 1 }}>
        <defs>
          <pattern id="hgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0d1424" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hgrid)" />
        {commits.length === 0 && (
          <text x="40%" y="50%" textAnchor="middle" fill="#2a3a4a" fontFamily='"Share Tech Mono", monospace' fontSize="14">
            История пуста — сделай "save" в SANDBOX
          </text>
        )}
        {/* bezier lines parent→child */}
        {commits.map(c => {
          if (!c.parentHash) return null
          const parent = repository.commits.find(pp => pp.hash === c.parentHash)
          if (!parent) return null
          const x1 = xOf(c.branch), y1 = yOf(c.hash), x2 = xOf(parent.branch), y2 = yOf(parent.hash)
          const d = x1 === x2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
          return <path key={`l${c.hash}`} d={d} fill="none" stroke={branchColor.get(c.branch) ?? '#1e2d4a'} strokeWidth={2} opacity={0.6} />
        })}
        {/* commits */}
        {commits.map(c => {
          const x = xOf(c.branch), y = yOf(c.hash), col = branchColor.get(c.branch) ?? '#00e676'
          const isHead = repository.head === c.hash
          const r = hover === c.hash ? 14 : sel === c.hash ? 12 : 10
          return (
            <g key={c.hash} style={{ cursor: 'pointer' }} onClick={() => setSel(c.hash)}
              onDoubleClick={() => loadState(c)}
              onMouseEnter={() => setHover(c.hash)} onMouseLeave={() => setHover(h => h === c.hash ? null : h)}>
              <circle cx={x} cy={y} r={r} fill={sel === c.hash ? col : '#0d1424'} stroke="#ffffff" strokeWidth={2} />
              <circle cx={x} cy={y} r={r - 3} fill={col} opacity={0.5} />
              <text x={x - 16} y={y + 4} textAnchor="end" fill="#5a7090" fontFamily='"Share Tech Mono", monospace' fontSize="10">{c.hash}</text>
              <text x={x + 18} y={y - 3} fill="#c8d8f0" fontFamily='"Share Tech Mono", monospace' fontSize="11">{c.message.slice(0, 26)}</text>
              <text x={x + 18} y={y + 11} fill="#4a6a8a" fontFamily='"Share Tech Mono", monospace' fontSize="9">
                {new Date(c.timestamp).toLocaleTimeString().slice(0, 5)} • {c.branch}
              </text>
              {isHead && <text x={x + 18} y={y + 24} fill="#00e676" fontFamily='"Share Tech Mono", monospace' fontSize="9">→ (HEAD)</text>}
            </g>
          )
        })}
      </svg>

      {/* commit detail card */}
      {selCommit && (
        <div style={{ width: 300, flexShrink: 0, background: '#0d1424', borderLeft: '2px solid #1e2d4a',
          padding: '16px 18px', fontFamily: '"Share Tech Mono", monospace', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto' }}>
          <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 9, color: branchColor.get(selCommit.branch) ?? '#00e676' }}>Коммит {selCommit.hash}</div>
          <div style={{ fontSize: 12, color: '#c8d8f0' }}>"{selCommit.message}"</div>
          <div style={{ borderTop: '1px solid #1e2d4a', margin: '4px 0' }} />
          {[['Ветка', selCommit.branch], ['Время', new Date(selCommit.timestamp).toLocaleTimeString()],
            ['Родитель', selCommit.parentHash ?? '(root)']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11 }}><span style={{ color: '#4a6a8a', minWidth: 70 }}>{k}:</span><span style={{ color: '#c8d8f0' }}>{v}</span></div>
          ))}
          <div style={{ borderTop: '1px solid #1e2d4a', margin: '4px 0' }} />
          <div style={{ fontSize: 10, color: '#5a7090' }}>СОСТОЯНИЕ СЕТИ:</div>
          <div style={{ fontSize: 11, color: '#c8d8f0' }}>Узлов: {selCommit.state.nodes.length}  Рёбер: {selCommit.state.edges.length}</div>
          <div style={{ fontSize: 11, color: '#ffb300' }}>Биты: {selCommit.state.economy.bits.toLocaleString()} ⬡  AS: {selCommit.state.economy.asLevel}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <CardBtn label="▶ Загрузить состояние" color="#00e676" onClick={() => loadState(selCommit)} />
            <CardBtn label="🔀 Ветку отсюда" color="#9c6bff" onClick={() => { gitCheckout(selCommit.hash); gitBranch(`branch-${selCommit.hash.slice(0, 4)}`); setMode('sandbox') }} />
            <CardBtn label="✕ Закрыть" color="#5a7090" onClick={() => setSel(null)} />
          </div>
        </div>
      )}
    </div>
  )
}

function MiniBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [h, setH] = useState(false)
  return <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 10, padding: '4px 8px', cursor: 'pointer',
      background: h ? `${color}22` : 'transparent', border: `1px solid ${color}`, color }}>{label}</button>
}
function CardBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [h, setH] = useState(false)
  return <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ fontFamily: '"Press Start 2P", cursive', fontSize: 8, padding: '9px', cursor: 'pointer',
      background: h ? `${color}18` : 'transparent', border: `1.5px solid ${color}`, color, lineHeight: 1.4 }}>{label}</button>
}
