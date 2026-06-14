import { create } from 'zustand'

export interface Protocols {
  transport:   'TCP' | 'UDP'
  application: 'HTTP' | 'HTTPS'
  vpn:         'none' | 'WireGuard' | 'VLESS' | 'Shadowsocks'
  dns:         'DNS' | 'DoH' | 'DoT'
}

interface NetWarStore {
  mode:                'topology' | 'sandbox'
  // economy (expanded in block 6)
  bits:                number
  cleanIPs:            number
  asLevel:             number
  totalIncome:         number
  paused:              boolean
  speed:               number
  speedIdx:            number
  ospfActive:          boolean
  selectedNodeId:      string | null
  scenarioPanelOpen:   boolean
  activeScenario:      number | null
  activeScenarioStep:  number
  protocols:           Protocols
  ospfSrcId:           string | null
  ospfDstId:           string | null

  setMode:               (m: 'topology' | 'sandbox') => void
  spend:                 (bits: number, ips?: number) => boolean
  earn:                  (bits: number) => void
  addCleanIPs:           (n: number) => void
  setAsLevel:            (n: number) => void
  setPaused:             (v: boolean) => void
  cycleSpeed:            () => void
  setOspfActive:         (v: boolean) => void
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
  bits:               1000,
  cleanIPs:           5,
  asLevel:            1,
  totalIncome:        0,
  paused:             false,
  speed:              1,
  speedIdx:           1,
  ospfActive:         false,
  selectedNodeId:     null,
  scenarioPanelOpen:  false,
  activeScenario:     null,
  activeScenarioStep: 0,
  protocols: { transport: 'TCP', application: 'HTTP', vpn: 'none', dns: 'DNS' },
  ospfSrcId:  null,
  ospfDstId:  null,

  setMode:     m  => set({ mode: m }),
  spend: (bits, ips = 0) => {
    const s = get()
    if (s.bits < bits || s.cleanIPs < ips) return false
    set({ bits: s.bits - bits, cleanIPs: s.cleanIPs - ips })
    return true
  },
  earn: (bits) => set(s => ({ bits: s.bits + bits, totalIncome: s.totalIncome + bits })),
  addCleanIPs: (n) => set(s => ({ cleanIPs: s.cleanIPs + n })),
  setAsLevel: (n) => set({ asLevel: n }),
  setPaused:   v  => set({ paused: v }),
  cycleSpeed:  ()  => set(s => {
    const idx = (s.speedIdx + 1) % SPEEDS.length
    return { speedIdx: idx, speed: SPEEDS[idx] }
  }),
  setOspfActive:  v  => set({ ospfActive: v }),
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
