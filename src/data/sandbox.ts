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

// ─── Educational tool info (hover cards) ───────────────────────────────────────
export interface ToolInfo { level: string; func: string; protocols: string; note: string }
export const TOOL_INFO: Record<SbType, ToolInfo> = {
  User:      { level: 'Источник',     func: 'Создаёт трафик',                protocols: 'HTTP, HTTPS, DNS', note: 'Настрой протокол кликом' },
  Router:    { level: 'L3 — Сетевой', func: 'Маршрутизация по IP',           protocols: 'OSPF, BGP, IP',    note: 'Обязателен между Switch и ТСПУ' },
  Switch:    { level: 'L2 — Канальный', func: 'Коммутация по MAC',            protocols: 'Ethernet, VLAN',   note: 'НЕ видит IP адреса!' },
  DNS:       { level: 'L7 — Прикладной', func: 'Резолюция имён → IP',         protocols: 'DNS 53, DoH, DoT', note: 'Подключай к User/Router' },
  VPN:       { level: 'L3/L4 — Туннель', func: 'Шифрует трафик в туннель',    protocols: 'WireGuard, VLESS', note: 'Ставь параллельно ТСПУ! Нужен ◈' },
  Firewall:  { level: 'L3/L4',        func: 'Фильтр по IP/порту',             protocols: 'iptables, stateful', note: 'Перед WebServer' },
  WebServer: { level: 'L7 — Прикладной', func: 'Принимает запросы',           protocols: 'HTTP, HTTPS',      note: 'Конечная цель трафика' },
  CDN:       { level: 'L7 — Прикладной', func: 'Кэширует контент',            protocols: 'HTTP, HTTPS',      note: 'Ускоряет доставку' },
  ТСПУ:     { level: 'L3/L7 — DPI',   func: 'Блокирует по IP/SNI/DNS',        protocols: 'DPI',              note: 'ВРАГ — появляется в ивентах' },
}

// ─── Upkeep (bits/sec) ─────────────────────────────────────────────────────────
export const SB_UPKEEP: Record<SbType, number> = {
  User: 0, Switch: 1, Router: 3, DNS: 2, VPN: 5, Firewall: 4, WebServer: 3, CDN: 4, ТСПУ: 0,
}
export function edgeUpkeep(bw: number): number {
  if (bw >= 10000) return 5
  if (bw >= 1000)  return 2
  return 0.5
}
