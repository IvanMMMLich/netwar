// ─── Sandbox node catalogue & edge defaults ──────────────────────────────────

export type SbType =
  | 'User' | 'Router' | 'Switch' | 'DNS' | 'VPN' | 'Firewall' | 'WebServer' | 'CDN' | 'ТСПУ'

export interface SbCatalogItem {
  type: SbType
  label: string
  full: string
  color: string
  bits: number       // price in bits
  ips: number        // price in clean IPs
  enemy?: boolean    // not buyable (ТСПУ)
  max?: number       // max instances allowed
}

export const SB_CATALOG: SbCatalogItem[] = [
  { type: 'User',      label: 'U',   full: 'User',      color: '#f0f4ff', bits: 0,   ips: 0, max: 5 },
  { type: 'Router',    label: 'R',   full: 'Router',    color: '#00b4ff', bits: 150, ips: 0 },
  { type: 'Switch',    label: 'SW',  full: 'Switch',    color: '#5a7090', bits: 50,  ips: 0 },
  { type: 'DNS',       label: 'DNS', full: 'DNS',       color: '#ffb300', bits: 100, ips: 0 },
  { type: 'VPN',       label: 'VPN', full: 'VPN',       color: '#9c6bff', bits: 300, ips: 1 },
  { type: 'Firewall',  label: 'FW',  full: 'Firewall',  color: '#ff8c00', bits: 200, ips: 0 },
  { type: 'WebServer', label: 'WS',  full: 'Server',    color: '#8090a0', bits: 200, ips: 0, max: 3 },
  { type: 'CDN',       label: 'CDN', full: 'CDN',       color: '#00e676', bits: 250, ips: 0 },
  { type: 'ТСПУ',     label: 'T',   full: 'ТСПУ',      color: '#ff4444', bits: 0,   ips: 0, enemy: true },
]

export const SB_BY_TYPE = new Map(SB_CATALOG.map(c => [c.type, c]))

export const SB_NODE_SIZE = 56

export interface SbEdgeParams { bw: number; latency: number; loss: number }

// auto edge params by node-type pair (block 3)
export function sbEdgeParams(a: SbType, b: SbType): SbEdgeParams {
  const key = (x: SbType, y: SbType) => `${x}>${y}`
  const tries = [key(a, b), key(b, a)]
  const table: Record<string, SbEdgeParams> = {
    'User>Switch':       { bw: 100,   latency: 1,    loss: 0 },
    'Switch>Router':     { bw: 1000,  latency: 1,    loss: 0 },
    'Router>Router':     { bw: 10000, latency: 5,    loss: 0 },
    'Router>ТСПУ':      { bw: 10000, latency: 0.5,  loss: 0 },
    'Router>DNS':        { bw: 100,   latency: 5,    loss: 0 },
    'VPN>Router':        { bw: 1000,  latency: 45,   loss: 0.1 },
    'Router>Firewall':   { bw: 10000, latency: 0.2,  loss: 0 },
    'Firewall>WebServer':{ bw: 10000, latency: 0.2,  loss: 0 },
  }
  for (const t of tries) if (table[t]) return { ...table[t] }
  return { bw: 1000, latency: 5, loss: 0 }
}

export function sbBwWidth(bw: number): number {
  if (bw >= 10000) return 4
  if (bw >= 1000)  return 2
  return 1
}

export function sbBwLabel(bw: number): string {
  return bw >= 1000 ? `${bw / 1000} Гбит/с` : `${bw} Мбит/с`
}
