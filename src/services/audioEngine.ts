// ─── audioEngine.ts — procedural chiptune music + SFX via Web Audio API ─────────

type Mood = 'normal' | 'tspu' | 'attack' | 'victory'

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private enabled = false
  private playing = false
  private step = 0
  private nextNoteTime = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private mood: Mood = 'normal'

  isEnabled() { return this.enabled }

  private ensureCtx() {
    if (this.ctx) return
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    this.ctx = new AC()
    this.master = this.ctx.createGain(); this.master.gain.value = 0; this.master.connect(this.ctx.destination)
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master)
  }

  toggle(): boolean { this.enabled ? this.disable() : this.enable(); return this.enabled }

  enable() {
    this.ensureCtx()
    if (this.ctx!.state === 'suspended') this.ctx!.resume()
    this.enabled = true
    localStorage.setItem('netwar_audio_enabled', 'true')
    // fade in over 2s
    this.master!.gain.cancelScheduledValues(this.ctx!.currentTime)
    this.master!.gain.setValueAtTime(this.master!.gain.value, this.ctx!.currentTime)
    this.master!.gain.linearRampToValueAtTime(0.6, this.ctx!.currentTime + 2)
    this.startMusic()
  }

  disable() {
    this.enabled = false
    localStorage.setItem('netwar_audio_enabled', 'false')
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4)
    }
    this.stopMusic()
  }

  setMood(m: Mood) { this.mood = m; if (m === 'victory') this.victoryJingle() }

  // ── music sequencer (16-step loop, 120 BPM = 0.125s per 1/8) ──
  private bass = [110, 110, 130.8, 164.8, 110, 98, 110, 82.4]   // Am-ish
  private mel  = [329.6, 293.7, 261.6, 293.7, 329.6, 329.6, 329.6, 0]
  private arp  = [440, 523.3, 659.3, 880]

  private startMusic() {
    if (this.playing || !this.ctx) return
    this.playing = true; this.nextNoteTime = this.ctx.currentTime; this.step = 0
    this.timer = setInterval(() => this.scheduler(), 40)
  }
  private stopMusic() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null } }

  private scheduler() {
    if (!this.ctx || !this.playing) return
    const tempoMul = this.mood === 'tspu' ? 0.9 : 1
    const spb = 0.125 * tempoMul   // seconds per 1/8 note
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.scheduleStep(this.step, this.nextNoteTime)
      this.nextNoteTime += spb
      this.step = (this.step + 1) % 16
    }
  }

  private scheduleStep(step: number, t: number) {
    const i = step % 8
    const oct = this.mood === 'attack' ? 0.5 : 1
    // bass every 1/8
    this.tone('sawtooth', this.bass[i] * oct, t, 0.12, 0.12, this.musicGain!)
    // arpeggio 1/16 (two per step) once we're past bar 4
    this.tone('square', this.arp[step % 4], t, 0.06, 0.04, this.musicGain!)
    this.tone('square', this.arp[(step + 2) % 4], t + 0.0625, 0.06, 0.04, this.musicGain!)
    // melody on the beat
    if (this.mel[i]) this.tone('triangle', this.mel[i], t, 0.12, 0.06, this.musicGain!)
    // dissonance when ТСПУ aggressive
    if (this.mood === 'tspu' && step % 4 === 0) this.tone('sawtooth', this.bass[i] * 1.06, t, 0.12, 0.05, this.musicGain!)
    // percussion
    if (step % 4 === 0) this.noise(t, 0.05, 'lowpass', 200, 0.4)       // kick on 1 & 3
    if (step % 2 === 0) this.noise(t, 0.02, 'highpass', 3000, 0.12)     // hi-hat
  }

  private tone(type: OscillatorType, freq: number, t: number, dur: number, vol: number, dest: AudioNode) {
    if (!this.ctx || !freq) return
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02)
  }

  private noise(t: number, dur: number, filter: BiquadFilterType, freq: number, vol: number) {
    if (!this.ctx) return
    const n = Math.floor(this.ctx.sampleRate * dur)
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate)
    const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource(); src.buffer = buf
    const f = this.ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f); f.connect(g); g.connect(this.musicGain!); src.start(t); src.stop(t + dur)
  }

  // ── SFX ──
  private sweep(type: OscillatorType, freqs: number[], dur: number, vol: number) {
    if (!this.enabled || !this.ctx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator(); o.type = type
    o.frequency.setValueAtTime(freqs[0], t)
    freqs.slice(1).forEach((f, i) => o.frequency.linearRampToValueAtTime(f, t + dur * (i + 1) / freqs.length))
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + 0.02)
  }
  private chord(freqs: number[], dur: number, vol: number, type: OscillatorType = 'sine') {
    if (!this.enabled || !this.ctx) return
    const t = this.ctx.currentTime
    freqs.forEach(f => this.tone(type, f, t, dur, vol, this.master!))
  }

  sfxDelivered() { this.sweep('sine', [800, 1200], 0.18, 0.2) }
  sfxBlocked()   { this.sweep('square', [200, 50], 0.2, 0.3) }
  sfxDns()       { if (this.enabled && this.ctx) this.noise(this.ctx.currentTime, 0.03, 'bandpass', 1200, 0.15) }
  sfxVpn()       { this.sweep('sawtooth', [400, 200, 600], 0.3, 0.25) }
  sfxEvent()     { if (!this.enabled || !this.ctx) return; const t = this.ctx.currentTime; this.tone('sine', 440, t, 0.5, 0.3, this.master!); this.tone('sine', 450, t, 0.5, 0.3, this.master!) }
  sfxNode()      { if (this.enabled && this.ctx) this.noise(this.ctx.currentTime, 0.01, 'highpass', 2000, 0.2) }
  sfxEdge()      { this.sweep('sawtooth', [1000, 100], 0.1, 0.15) }
  sfxCommit()    { this.chord([523, 659, 784], 0.4, 0.2) }
  sfxMerge()     { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.chord([f], 0.12, 0.3), i * 100)) }
  sfxError()     { this.sweep('square', [200, 200], 0.15, 0.2) }
  private victoryJingle() { this.sfxMerge() }
}

export const audio = new AudioEngine()
