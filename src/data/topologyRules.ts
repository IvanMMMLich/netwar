// ─── topologyRules.ts — single source of truth for sandbox topology rules ──────
// All connection legality, validation and path logic lives here. Components must
// import from this file rather than hard-coding rules.

import { SbType } from './sandbox'

export interface RuleNode { id: string; type: SbType }
export interface RuleEdge { source: string; target: string }

// Which node types may connect to which (undirected — checked both ways).
export const ALLOWED_CONNECTIONS: Record<SbType, SbType[]> = {
  User:      ['Switch', 'DNS'],
  Switch:    ['Router', 'User'],
  Router:    ['ТСПУ', 'VPN', 'Firewall', 'Router', 'DNS', 'Switch'],
  ТСПУ:     ['Router', 'Firewall', 'VPN'],
  VPN:       ['Router', 'Firewall', 'ТСПУ'],
  Firewall:  ['WebServer', 'CDN', 'Router', 'VPN', 'ТСПУ'],
  WebServer: ['Firewall', 'CDN'],
  CDN:       ['Firewall', 'WebServer'],
  DNS:       ['User', 'Router', 'DNS'],
}

export interface ForbiddenPair { from: SbType; to: SbType; reason: string }

export const FORBIDDEN_CONNECTIONS: ForbiddenPair[] = [
  { from: 'User', to: 'WebServer', reason: 'Между User и WebServer нужен Router/Switch' },
  { from: 'User', to: 'Firewall',  reason: 'User не видит Firewall напрямую' },
  { from: 'User', to: 'ТСПУ',     reason: 'ТСПУ ставит провайдер, не User' },
  { from: 'User', to: 'User',      reason: 'Два User нельзя соединять' },
  { from: 'WebServer', to: 'WebServer', reason: 'Два WebServer нельзя соединять' },
  { from: 'User', to: 'VPN',       reason: 'VPN ставится в сети провайдера, не у User' },
  { from: 'DNS', to: 'WebServer',  reason: 'DNS не соединяется с WebServer напрямую' },
]

// "warn" pairs — technically connectable but a teaching anti-pattern.
const WARN_PAIRS: { from: SbType; to: SbType; reason: string }[] = [
  { from: 'ТСПУ', to: 'VPN', reason: 'VPN не обойдёт ТСПУ так! Ставь Router→VPN→Firewall параллельно ТСПУ' },
]

export interface ConnectionHint { allowed: boolean; level: 'ok' | 'warn' | 'error'; message: string }

export function getConnectionHint(from: SbType, to: SbType): ConnectionHint {
  // forbidden (either direction)
  const f = FORBIDDEN_CONNECTIONS.find(p => (p.from === from && p.to === to) || (p.from === to && p.to === from))
  if (f) return { allowed: false, level: 'error', message: `✗ Запрещено — ${f.reason}` }
  // warn
  const w = WARN_PAIRS.find(p => (p.from === from && p.to === to) || (p.from === to && p.to === from))
  if (w) return { allowed: true, level: 'warn', message: `⚠ ${w.reason}` }
  // allowed?
  const ok = (ALLOWED_CONNECTIONS[from] ?? []).includes(to) || (ALLOWED_CONNECTIONS[to] ?? []).includes(from)
  if (ok) return { allowed: true, level: 'ok', message: `✓ ${to} — допустимо` }
  return { allowed: false, level: 'error', message: `✗ Нельзя соединить ${from} → ${to}` }
}

// ─── Graph helpers ─────────────────────────────────────────────────────────────

export function buildAdj(nodes: RuleNode[], edges: RuleEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]))
  for (const e of edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source) }
  return adj
}

// BFS path (by hops) between two specific nodes
export function findPath(nodes: RuleNode[], edges: RuleEdge[], fromId: string, toId: string): string[] | null {
  const adj = buildAdj(nodes, edges)
  const prev = new Map<string, string>(); const seen = new Set([fromId]); const q = [fromId]
  while (q.length) {
    const u = q.shift()!
    if (u === toId) { const path = [u]; let c = u; while (prev.has(c)) { c = prev.get(c)!; path.unshift(c) } return path }
    for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); prev.set(v, u); q.push(v) }
  }
  return null
}

// BFS to the first node satisfying a type predicate
export function bfsToType(nodes: RuleNode[], edges: RuleEdge[], src: string, type: SbType): string[] | null {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const adj = buildAdj(nodes, edges)
  const prev = new Map<string, string>(); const seen = new Set([src]); const q = [src]
  while (q.length) {
    const u = q.shift()!
    if (u !== src && byId.get(u)?.type === type) { const path = [u]; let c = u; while (prev.has(c)) { c = prev.get(c)!; path.unshift(c) } return path }
    for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); prev.set(v, u); q.push(v) }
  }
  return null
}

export function isTspuOnPath(nodes: RuleNode[], edges: RuleEdge[], userId: string, wsId: string): boolean {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const path = findPath(nodes, edges, userId, wsId)
  return !!path && path.some(id => byId.get(id)?.type === 'ТСПУ')
}

// VPN bypasses ТСПУ iff there's a User→WebServer path that goes through VPN but NOT ТСПУ
export function isVpnBypassingTspu(nodes: RuleNode[], edges: RuleEdge[]): boolean {
  const users = nodes.filter(n => n.type === 'User')
  const servers = nodes.filter(n => n.type === 'WebServer')
  const byId = new Map(nodes.map(n => [n.id, n]))
  for (const u of users) for (const w of servers) {
    const path = findPath(nodes, edges, u.id, w.id)
    if (path && path.some(id => byId.get(id)?.type === 'VPN') && !path.some(id => byId.get(id)?.type === 'ТСПУ')) return true
  }
  return false
}

export interface ValidationResult { errors: string[]; warnings: string[]; tips: string[] }

export function validateTopology(nodes: RuleNode[], edges: RuleEdge[]): ValidationResult {
  const errors: string[] = [], warnings: string[] = [], tips: string[] = []
  const users = nodes.filter(n => n.type === 'User')
  const servers = nodes.filter(n => n.type === 'WebServer')
  const dns = nodes.filter(n => n.type === 'DNS')
  const tspu = nodes.filter(n => n.type === 'ТСПУ')
  const vpn = nodes.filter(n => n.type === 'VPN')

  if (!users.length) { errors.push('✗ Нет ни одного User'); tips.push('Добавь User — источник трафика') }
  if (!servers.length) { errors.push('✗ Нет WebServer'); tips.push('Добавь WebServer как цель трафика') }

  let pathFound = false, pathViaTspu = false
  for (const u of users) {
    const p = bfsToType(nodes, edges, u.id, 'WebServer')
    if (p) { pathFound = true; if (p.some(id => nodes.find(n => n.id === id)?.type === 'ТСПУ')) pathViaTspu = true }
  }
  if (users.length && servers.length && !pathFound) { errors.push('✗ Нет пути User → WebServer'); tips.push('Соедини User → Switch → Router → Firewall → WebServer') }

  // isolated
  const adj = buildAdj(nodes, edges)
  const connected = new Set<string>()
  if (nodes.length) { const st = [nodes[0].id]; connected.add(nodes[0].id); while (st.length) { const u = st.pop()!; for (const v of adj.get(u) ?? []) if (!connected.has(v)) { connected.add(v); st.push(v) } } }
  const isolated = nodes.filter(n => !connected.has(n.id))
  if (isolated.length) { warnings.push(`⚠ Изолированных узлов: ${isolated.length}`); tips.push('Подключи изолированные узлы рёбрами') }

  if (pathViaTspu) {
    warnings.push('⚠ ТСПУ на пути блокирует трафик')
    if (isVpnBypassingTspu(nodes, edges)) tips.push('✓ VPN обходит ТСПУ параллельно')
    else { errors.push('✗ VPN не настроен для обхода ТСПУ'); tips.push('Поставь VPN параллельно ТСПУ: Router→VPN→Firewall') }
  }
  if (!dns.length) warnings.push('⚠ DNS сервер не настроен')

  if (!errors.length && !warnings.length) tips.push('Топология готова — нажми RUN')
  return { errors, warnings, tips }
}
