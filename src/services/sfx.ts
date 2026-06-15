import { zzfx, ZZFX } from 'zzfx'
import * as Tone from 'tone'
import { master, playVictoryJingle } from './music'

let enabled = false
export function setSfxEnabled(v: boolean) { enabled = v; ZZFX.volume = v ? 0.3 : 0 }
export function sfxEnabled() { return enabled }

const z = (...p: number[]) => { if (enabled) try { zzfx(...p) } catch { /* ctx not ready */ } }

export const SFX = {
  PACKET_DELIVERED: () => z(0.5, 0, 880, 0, 0.05, 0.1, 0, 2, 0, 0, 440, 0.05, 0, 0, 0, 0, 0, 0.5),
  DNS_RESOLVED:     () => z(0.3, 0, 660, 0, 0.04, 0.08, 0, 1.5, 0, 0, 220, 0.04, 0, 0, 0, 0, 0, 0.4),
  VPN_TUNNELED:     () => z(0.6, 0.1, 180, 0.05, 0.15, 0.2, 0, 0, -0.5, 0, 0, 0, 0, 0, 8, 0, 0, 0.3),
  PACKET_BLOCKED:   () => z(0.7, 0.2, 60, 0, 0.1, 0.2, 3, 0.5, -0.3, 0, 0, 0, 0, 4, 0, 4, 0, 0.1),
  NODE_CREATED:     () => z(0.4, 0, 1200, 0, 0.01, 0.03, 0, 3, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0),
  EDGE_CREATED:     () => z(0.5, 0.3, 800, 0, 0.02, 0.08, 1, 1, -1, 0, 0, 0, 0, 2, 0, 0, 0, 0),
  CONNECTION_DENIED:() => z(0.6, 0, 120, 0, 0.05, 0.15, 2, 0.5, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0),
  EVENT_ALERT:      () => z(0.8, 0, 440, 0.1, 0.3, 0.4, 0, 1, 0, 0, -110, 0.2, 0, 0, 4, 0, 0, 0.6),
  ATTACK_START:     () => z(1, 0.5, 60, 0, 0.2, 0.5, 3, 0.3, -0.5, 0, 0, 0, 0, 8, 0, 8, 0, 0.2),
  BRANCH_SWITCH:    () => z(0.4, 0, 330, 0, 0.05, 0.1, 0, 1.5, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0.5),
  TSPU_ACTIVATE:    () => z(0.9, 0.1, 200, 0.2, 0.3, 0.5, 2, 0.5, -0.2, 0, 0, 0, 0, 2, 8, 4, 0, 0.3),
  TSPU_DEACTIVATE:  () => z(0.5, 0, 400, 0, 0.1, 0.2, 0, 2, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0.6),
  SHOP_BUY:         () => z(0.5, 0, 523, 0, 0.05, 0.1, 0, 1.5, 0, 0, 262, 0.05, 0, 0, 0, 0, 0, 0.4),
  SHOP_NO_MONEY:    () => z(0.5, 0, 150, 0, 0.05, 0.1, 2, 0.3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0),
  TUTORIAL_NEXT:    () => z(0.3, 0, 660, 0, 0.02, 0.06, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5),
  NODE_HOVER:       () => z(0.1, 0, 1400, 0, 0.01, 0.02, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2),

  GIT_COMMIT: () => {
    if (!enabled) return
    const now = Tone.now(); const s = new Tone.Synth({ oscillator: { type: 'sine' }, volume: -15 }).connect(master)
    s.triggerAttackRelease('C5', '8n', now); s.triggerAttackRelease('E5', '8n', now + 0.08); s.triggerAttackRelease('G5', '8n', now + 0.16)
    setTimeout(() => s.dispose(), 800)
  },
  MERGE_SUCCESS: () => { if (enabled) playVictoryJingle() },
  AS_LEVEL_UP: () => {
    if (!enabled) return
    const now = Tone.now(); const s = new Tone.Synth({ oscillator: { type: 'square' }, volume: -12 }).connect(master)
    ;['C5', 'E5', 'G5', 'B5', 'C6'].forEach((n, i) => s.triggerAttackRelease(n, '8n', now + i * 0.1))
    setTimeout(() => s.dispose(), 1500)
  },
  TUTORIAL_COMPLETE: () => {
    if (!enabled) return
    const now = Tone.now(); const s = new Tone.PolySynth().connect(master)
    s.triggerAttackRelease(['C5', 'E5', 'G5'], '4n', now); s.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], '4n', now + 0.3)
    setTimeout(() => s.dispose(), 2000)
  },
}
