import { create } from 'zustand'
import { SaveRepository, SaveState, loadRepo, saveRepo, commit, createBranch, checkout, merge, isMergeConflict } from './services/saveSystem'

export interface Protocols {
  transport:   'TCP' | 'UDP'
  application: 'HTTP' | 'HTTPS'
  vpn:         'none' | 'WireGuard' | 'VLESS' | 'Shadowsocks'
  dns:         'DNS' | 'DoH' | 'DoT'
}

// income per delivered packet kind (sandbox = bits, topology = score)
export const PKT_INCOME: Record<string, number> = {
  http: 5, tcp: 5, udp: 3, dns: 2, tunnel: 8, vpn: 8, cdn: 4, blocked: 0,
}

interface NetWarStore {
  mode:                'topology' | 'sandbox' | 'history'
  repository:          SaveRepository
  // economy (expanded in block 6, reworked with upkeep)
  bits:                number      // sandbox spendable currency
  score:               number      // topology points (not spent)
  cleanIPs:            number
  asLevel:             number
  totalIncome:         number
  upkeepRate:          number      // bits/sec spent on upkeep (sandbox)
  incomeRate:          number      // bits/sec earned (sandbox)
  paused:              boolean
  speed:               number
  speedIdx:            number
  ospfActive:          boolean
  layersMode:          boolean
  selectedNodeId:      string | null
  scenarioPanelOpen:   boolean
  activeScenario:      number | null
  activeScenarioStep:  number
  protocols:           Protocols
  ospfSrcId:           string | null
  ospfDstId:           string | null

  setMode:               (m: 'topology' | 'sandbox' | 'history') => void
  gitCommit:             (message: string, state: SaveState) => string
  gitBranch:             (name: string) => void
  gitCheckout:           (hash: string) => void
  gitMerge:              (branchName: string) => { ok: boolean; msg: string }
  spend:                 (bits: number, ips?: number) => boolean
  earn:                  (bits: number) => void
  scorePacket:           (kind: string) => void   // topology points
  earnPacket:            (kind: string) => void    // sandbox bits
  chargeUpkeep:          (bits: number) => void     // can go negative
  setRates:              (upkeep: number, income: number) => void
  addCleanIPs:           (n: number) => void
  setAsLevel:            (n: number) => void
  setPaused:             (v: boolean) => void
  cycleSpeed:            () => void
  setOspfActive:         (v: boolean) => void
  setLayersMode:         (v: boolean) => void
  setSelectedNode:       (id: string | null) => void
  setScenarioPanelOpen:  (v: boolean) => void
  setActiveScenario:     (n: number | null) => void
  nextStep:              () => void
  prevStep:              () => void
  setProtocol:           <K extends keyof Protocols>(key: K, val: Protocols[K]) => void
  setOspfSrc:            (id: string | null) => void
  setOspfDst:            (id: string | null) => void
  clearOspf:             () => void
}

const SPEEDS = [0.5, 1, 1.5, 2]

export const useStore = create<NetWarStore>((set, get) => ({
  mode:               'topology',
  repository:         loadRepo(),
  bits:               500,
  score:              0,
  cleanIPs:           3,
  asLevel:            1,
  totalIncome:        0,
  upkeepRate:         0,
  incomeRate:         0,
  paused:             false,
  speed:              1,
  speedIdx:           1,
  ospfActive:         false,
  layersMode:         false,
  selectedNodeId:     null,
  scenarioPanelOpen:  false,
  activeScenario:     null,
  activeScenarioStep: 0,
  protocols: { transport: 'TCP', application: 'HTTP', vpn: 'none', dns: 'DNS' },
  ospfSrcId:  null,
  ospfDstId:  null,

  setMode:     m  => set({ mode: m }),
  gitCommit: (message, state) => {
    const repo = commit(get().repository, message, state); saveRepo(repo); set({ repository: repo }); return repo.head
  },
  gitBranch: (name) => { const repo = createBranch(get().repository, name); saveRepo(repo); set({ repository: repo }) },
  gitCheckout: (hash) => { const repo = checkout(get().repository, hash); saveRepo(repo); set({ repository: repo }) },
  gitMerge: (branchName) => {
    const res = merge(get().repository, branchName)
    if (isMergeConflict(res)) return { ok: false, msg: res.reason }
    saveRepo(res); set({ repository: res }); return { ok: true, msg: `Merge successful → ${res.currentBranch}` }
  },
  spend: (bits, ips = 0) => {
    const s = get()
    if (s.bits < bits || s.cleanIPs < ips) return false
    set({ bits: s.bits - bits, cleanIPs: s.cleanIPs - ips })
    return true
  },
  earn: (bits) => set(s => ({ bits: s.bits + bits, totalIncome: s.totalIncome + bits })),
  scorePacket: (kind) => set(s => ({ score: s.score + (PKT_INCOME[kind] ?? 0) })),
  earnPacket: (kind) => set(s => { const v = PKT_INCOME[kind] ?? 0; return { bits: s.bits + v, totalIncome: s.totalIncome + v } }),
  chargeUpkeep: (bits) => set(s => ({ bits: s.bits - bits })),
  setRates: (upkeep, income) => set({ upkeepRate: upkeep, incomeRate: income }),
  addCleanIPs: (n) => set(s => ({ cleanIPs: s.cleanIPs + n })),
  setAsLevel: (n) => set({ asLevel: n }),
  setPaused:   v  => set({ paused: v }),
  cycleSpeed:  ()  => set(s => {
    const idx = (s.speedIdx + 1) % SPEEDS.length
    return { speedIdx: idx, speed: SPEEDS[idx] }
  }),
  setOspfActive:  v  => set({ ospfActive: v }),
  setLayersMode:  v  => set({ layersMode: v }),
  setSelectedNode: id => set({ selectedNodeId: id }),
  setScenarioPanelOpen: v => set({ scenarioPanelOpen: v }),
  setActiveScenario: n => set({ activeScenario: n, activeScenarioStep: 0 }),
  nextStep: () => set(s => ({ activeScenarioStep: s.activeScenarioStep + 1 })),
  prevStep: () => set(s => ({ activeScenarioStep: Math.max(0, s.activeScenarioStep - 1) })),
  setProtocol: (key, val) => set(s => ({ protocols: { ...s.protocols, [key]: val } })),
  setOspfSrc: id => set({ ospfSrcId: id }),
  setOspfDst: id => set({ ospfDstId: id }),
  clearOspf:  () => set({ ospfSrcId: null, ospfDstId: null }),
}))
