import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { SFX } from '../services/sfx'
import { SbNode, SbEdge } from './Sandbox'
import { SB_BY_TYPE } from '../data/sandbox'
import { validateTopology } from '../data/topologyRules'

const CMDS = ['save ', 'branch ', 'checkout ', 'merge ', 'log', 'status', 'diff', 'help', 'clear', 'ls', 'history']

interface Props {
  nodes: SbNode[]; edges: SbEdge[]
  bits: number; cleanIPs: number; asLevel: number
  onApplyState: (nodes: SbNode[], edges: SbEdge[]) => void
  onMergeFlash: () => void
  onBranchSwitch: () => void
}

export default function GitTerminal({ nodes, edges, bits, cleanIPs, asLevel, onApplyState, onMergeFlash, onBranchSwitch }: Props) {
  const repository = useStore(s => s.repository)
  const gitCommit = useStore(s => s.gitCommit)
  const gitBranch = useStore(s => s.gitBranch)
  const gitCheckout = useStore(s => s.gitCheckout)
  const gitMerge = useStore(s => s.gitMerge)

  const [out, setOut] = useState<string[]>(['NETWAR TERMINAL — введи "help"'])
  const [input, setInput] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [suggest, setSuggest] = useState<string[]>([])
  const history = useRef<string[]>([])
  const hIdx = useRef(-1)
  const outRef = useRef<HTMLDivElement>(null)

  const print = useCallback((...lines: string[]) => setOut(p => [...p, ...lines]), [])
  useEffect(() => { outRef.current?.scrollTo(0, outRef.current.scrollHeight) }, [out])

  const buildState = () => ({ nodes, edges, economy: { bits: Math.round(bits), cleanIPs, asLevel }, stats: { delivered: 0, blocked: 0 } })

  const run = (raw: string) => {
    const line = raw.trim()
    print(`netwar@sandbox:~/${repository.currentBranch} $ ${line}`)
    if (line) { history.current.unshift(line); if (history.current.length > 100) history.current.pop() }
    hIdx.current = -1
    if (!line) return
    const m = line.match(/^(\S+)\s*(.*)$/); const cmd = m![1].toLowerCase(); const arg = m![2].trim()

    if (cmd === 'save') {
      const msg = arg.replace(/^["']|["']$/g, '') || 'без описания'
      const hash = gitCommit(msg, buildState()); SFX.GIT_COMMIT()
      print(`[${repository.currentBranch} ${hash}] ${msg}`, ` Узлов: ${nodes.length}, Рёбер: ${edges.length}, Битов: ${Math.round(bits).toLocaleString()}`)
    } else if (cmd === 'branch') {
      if (!arg) return print('usage: branch <имя>')
      gitBranch(arg); onBranchSwitch(); SFX.BRANCH_SWITCH()
      print(`Switched to a new branch '${arg}'`, ` Diverged from main at ${repository.head || '(root)'}`)
    } else if (cmd === 'checkout') {
      const c = repository.commits.find(x => x.hash === arg)
      const br = repository.branches.find(x => x.name === arg)
      if (c) { gitCheckout(arg); onApplyState(c.state.nodes as SbNode[], c.state.edges as SbEdge[]); print(`HEAD is now at ${arg} '${c.message}'`) }
      else if (br) { const bc = repository.commits.find(x => x.hash === br.headHash); gitCheckout(br.headHash); if (bc) onApplyState(bc.state.nodes as SbNode[], bc.state.edges as SbEdge[]); onBranchSwitch(); print(`Switched to branch '${arg}'`) }
      else print(`error: '${arg}' не найден`)
    } else if (cmd === 'merge') {
      if (!arg) return print('usage: merge <ветка>')
      const res = gitMerge(arg)
      if (res.ok) { onMergeFlash(); SFX.MERGE_SUCCESS(); print(`Merge made by the 'recursive' strategy.`, ` ${arg} → ${repository.currentBranch}`, ` ${nodes.length} nodes, ${edges.length} edges merged`) }
      else print(`CONFLICT: ${res.msg}`, ` Automatic merge failed. Use 'checkout имя' to pick a version.`)
    } else if (cmd === 'log' || cmd === 'history') {
      const hist = [...repository.commits].reverse()
      if (!hist.length) return print('нет коммитов')
      hist.forEach(c => print(`* ${c.hash} ${repository.head === c.hash ? '(HEAD → ' + c.branch + ') ' : `(${c.branch}) `}${c.message}`))
    } else if (cmd === 'status') {
      const v = validateTopology(nodes, edges)
      print(`On branch ${repository.currentBranch}`, '',
        `Economy:`, ` БИТЫ: ${Math.round(bits).toLocaleString()} ⬡  ЧИП-IP: ${cleanIPs} ◈  AS: ${asLevel}`, '',
        `Topology check: ${v.errors.length ? '✗ ' + v.errors[0] : '✓ путь существует'}`)
    } else if (cmd === 'diff') {
      const head = repository.commits.find(c => c.hash === repository.head)
      if (!head) return print('нет базового коммита (сделай save)')
      const prevIds = new Set((head.state.nodes as SbNode[]).map(n => n.id))
      const added = nodes.filter(n => !prevIds.has(n.id))
      if (!added.length) print('нет изменений с последнего коммита')
      added.forEach(n => print(`+ node ${SB_BY_TYPE.get(n.type)!.full} at (${Math.round(n.x)}, ${Math.round(n.y)})`))
    } else if (cmd === 'ls') {
      print(`nodes (${nodes.length}):`)
      nodes.forEach(n => print(`  [${SB_BY_TYPE.get(n.type)!.label}] ${SB_BY_TYPE.get(n.type)!.full} at (${Math.round(n.x)}, ${Math.round(n.y)})`))
      print(`edges (${edges.length}):`)
      edges.forEach(e => { const a = nodes.find(n => n.id === e.source), b = nodes.find(n => n.id === e.target); if (a && b) print(`  ${SB_BY_TYPE.get(a.type)!.full} → ${SB_BY_TYPE.get(b.type)!.full} [${e.bw >= 1000 ? e.bw / 1000 + 'Гбит/с' : e.bw + 'Мбит/с'} ${e.latency}мс]`) })
    } else if (cmd === 'clear') {
      setOut([])
    } else if (cmd === 'help') {
      print('NETWAR TERMINAL — команды:', '', 'СОХРАНЕНИЯ:',
        '  save "msg"      коммит', '  branch имя      новая ветка', '  checkout хэш    загрузить коммит',
        '  checkout ветка  переключить ветку', '  merge ветка     смержить', '  log / history   история',
        '  status / diff   состояние / изменения', '', 'ПРОСМОТР:', '  ls   список узлов и рёбер',
        '  clear   очистить', '  help   справка', '', 'СОВЕТЫ: ↑/↓ история • Tab автодополнение • Ctrl+L очистить')
    } else {
      print(`unknown command: ${cmd}. Type 'help' for commands`)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { run(input); setInput(''); setSuggest([]) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hIdx.current = Math.min(hIdx.current + 1, history.current.length - 1); setInput(history.current[hIdx.current] ?? '') }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hIdx.current = Math.max(hIdx.current - 1, -1); setInput(hIdx.current >= 0 ? history.current[hIdx.current] : '') }
    else if (e.key === 'Tab') {
      e.preventDefault()
      const tokens = input.split(' ')
      if (tokens.length <= 1) {
        const matches = CMDS.filter(c => c.startsWith(tokens[0]))
        if (matches.length === 1) { setInput(matches[0]); setSuggest([]) }
        else if (matches.length > 1) setSuggest(matches.map(s => s.trim()))
      } else if (tokens[0] === 'branch' || tokens[0] === 'checkout' || tokens[0] === 'merge') {
        const opts = tokens[0] === 'checkout' ? [...repository.branches.map(b => b.name), ...repository.commits.map(c => c.hash)] : repository.branches.map(b => b.name)
        const matches = opts.filter(o => o.startsWith(tokens[1] ?? ''))
        if (matches.length === 1) { setInput(`${tokens[0]} ${matches[0]}`); setSuggest([]) }
        else if (matches.length > 1) setSuggest(matches)
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setOut([]) }
  }

  return (
    <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 76, left: 90, right: 16, zIndex: 42,
      background: '#030508', border: '1px solid #00e676', fontFamily: '"Share Tech Mono", monospace' }}>
      {/* header */}
      <div onClick={() => setCollapsed(!collapsed)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 10px', borderBottom: '1px solid #1e2d4a', cursor: 'pointer', fontSize: 11, color: '#00e676' }}>
        <span>TERMINAL  netwar@sandbox:~/{repository.currentBranch} $</span>
        <span style={{ color: '#5a7090' }}>{collapsed ? '▲' : '▼'}</span>
      </div>
      {!collapsed && (
        <>
          <div ref={outRef} style={{ height: 130, overflowY: 'auto', padding: '6px 10px', fontSize: 11, lineHeight: 1.6 }}>
            {out.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'pre', color: l.startsWith('netwar@') ? '#00b4ff' : l.startsWith('[') || l.startsWith('Merge') || l.startsWith('Switched') ? '#00e676'
                : l.startsWith('CONFLICT') || l.startsWith('unknown') || l.startsWith('error') ? '#ff8c00' : l.startsWith('*') ? '#ffb300' : '#7a9ab8' }}>{l}</div>
            ))}
          </div>
          {suggest.length > 0 && (
            <div style={{ padding: '2px 10px', fontSize: 11, color: '#ffb300', borderTop: '1px solid #1e2d4a' }}>
              {suggest.join('   ')}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', height: 30, padding: '0 10px', borderTop: '1px solid #1e2d4a' }}>
            <span style={{ color: '#00e676', fontSize: 11, marginRight: 6, whiteSpace: 'nowrap' }}>netwar@sandbox:~/{repository.currentBranch} $</span>
            <input value={input} onChange={e => { setInput(e.target.value); setSuggest([]) }} onKeyDown={onKey}
              placeholder='help' autoComplete="off"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#00e676', fontFamily: '"Share Tech Mono", monospace', fontSize: 11 }} />
          </div>
        </>
      )}
    </div>
  )
}
