import { create } from 'zustand'

export interface Protocols {
  transport:   'TCP' | 'UDP'
  application: 'HTTP' | 'HTTPS'
  vpn:         'none' | 'WireGuard' | 'VLESS' | 'Shadowsocks'
  dns:         'DNS' | 'DoH' | 'DoT'
}

interface NetWarStore {
  mode:                'topology' | 'sandbox'
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
