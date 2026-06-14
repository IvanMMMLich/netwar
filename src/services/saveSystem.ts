// ─── saveSystem.ts — git-style save/branch/merge over localStorage ─────────────

export interface SaveState {
  nodes: unknown[]
  edges: unknown[]
  economy: { bits: number; cleanIPs: number; asLevel: number }
  stats:   { delivered: number; blocked: number }
}

export interface SaveCommit {
  hash: string
  message: string
  timestamp: number
  branch: string
  parentHash: string | null
  state: SaveState
}

export interface SaveBranch {
  name: string
  headHash: string
  color: string
  isActive: boolean
}

export interface SaveRepository {
  commits: SaveCommit[]
  branches: SaveBranch[]
  currentBranch: string
  head: string         // hash of current commit ('' if none)
}

export interface MergeConflict { conflict: true; reason: string }

const LS_KEY = 'netwar_repository'
const BRANCH_COLORS = ['#00b4ff', '#9c6bff', '#ffb300', '#ff8c00', '#00e5cc', '#ff4444']

function newHash(): string { return (Math.random().toString(16) + Math.random().toString(16)).replace(/[^a-f0-9]/g, '').slice(0, 7) }

export function initRepo(): SaveRepository {
  return { commits: [], branches: [{ name: 'main', headHash: '', color: '#00e676', isActive: true }], currentBranch: 'main', head: '' }
}

export function loadRepo(): SaveRepository {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw) } catch { /* corrupt */ }
  return initRepo()
}

export function saveRepo(repo: SaveRepository) {
  localStorage.setItem(LS_KEY, JSON.stringify(repo))
}

export function commit(repo: SaveRepository, message: string, state: SaveState): SaveRepository {
  const hash = newHash()
  const c: SaveCommit = { hash, message, timestamp: Date.now(), branch: repo.currentBranch, parentHash: repo.head || null, state }
  const branches = repo.branches.map(b => b.name === repo.currentBranch ? { ...b, headHash: hash } : b)
  return { ...repo, commits: [...repo.commits, c], branches, head: hash }
}

export function createBranch(repo: SaveRepository, name: string): SaveRepository {
  if (repo.branches.some(b => b.name === name)) return repo
  const color = BRANCH_COLORS[(repo.branches.length - 1) % BRANCH_COLORS.length]
  const branches = repo.branches.map(b => ({ ...b, isActive: false }))
  branches.push({ name, headHash: repo.head, color, isActive: true })
  return { ...repo, branches, currentBranch: name }
}

export function checkout(repo: SaveRepository, hash: string): SaveRepository {
  const c = repo.commits.find(x => x.hash === hash)
  if (!c) return repo
  // checkout switches HEAD (and active branch to the commit's branch)
  const branches = repo.branches.map(b => ({ ...b, isActive: b.name === c.branch }))
  return { ...repo, head: hash, currentBranch: c.branch, branches }
}

export function getCommit(repo: SaveRepository, hash: string): SaveCommit | undefined {
  return repo.commits.find(c => c.hash === hash)
}

export function merge(repo: SaveRepository, branchName: string): SaveRepository | MergeConflict {
  const src = repo.branches.find(b => b.name === branchName)
  if (!src) return { conflict: true, reason: `ветка '${branchName}' не найдена` }
  if (branchName === repo.currentBranch) return { conflict: true, reason: 'нельзя смержить ветку в саму себя' }
  const srcCommit = repo.commits.find(c => c.hash === src.headHash)
  if (!srcCommit) return { conflict: true, reason: 'в ветке нет коммитов' }
  // conflict if both branches have nodes at (nearly) the same coordinates
  const curCommit = repo.commits.find(c => c.hash === repo.head)
  if (curCommit) {
    const occ = new Map<string, boolean>()
    for (const n of curCommit.state.nodes as { x: number; y: number }[]) occ.set(`${Math.round(n.x / 40)},${Math.round(n.y / 40)}`, true)
    const clash = (srcCommit.state.nodes as { x: number; y: number }[]).some(n => occ.has(`${Math.round(n.x / 40)},${Math.round(n.y / 40)}`))
    if (clash) return { conflict: true, reason: 'узлы конфликтуют на одной позиции' }
  }
  // fast-forward style: create a merge commit on current branch carrying source state
  const merged = commit(repo, `Merge '${branchName}' → ${repo.currentBranch}`, srcCommit.state)
  return merged
}

export function getHistory(repo: SaveRepository): SaveCommit[] {
  // commits reachable from current branch head following parent links
  const out: SaveCommit[] = []
  let h: string | null = repo.branches.find(b => b.name === repo.currentBranch)?.headHash || repo.head
  const byHash = new Map(repo.commits.map(c => [c.hash, c]))
  while (h) { const c = byHash.get(h); if (!c) break; out.push(c); h = c.parentHash }
  return out
}

export function isMergeConflict(x: SaveRepository | MergeConflict): x is MergeConflict {
  return (x as MergeConflict).conflict === true
}
