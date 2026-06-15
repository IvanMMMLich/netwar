import * as Tone from 'tone'

const BPM_NORMAL = 120
const BPM_ALERT = 145

// master volume — everything routes through this so mute works in one place
export const master = new Tone.Volume(-2).toDestination()
const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.15 }).connect(master)

const leadSynth = new Tone.Synth({ oscillator: { type: 'square' },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2 }, volume: -18 }).connect(reverb)
const bassSynth = new Tone.Synth({ oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 }, volume: -14 }).connect(master)
const padSynth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' },
  envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.0 }, volume: -26 }).connect(master)
const kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6,
  envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }, volume: -10 }).connect(master)
const hihat = new Tone.MetalSynth({ harmonicity: 5.1, modulationIndex: 32,
  resonance: 4000, octaves: 1.5, volume: -28 } as ConstructorParameters<typeof Tone.MetalSynth>[0]).connect(master)

const MELODY_NORMAL = ['A4', null, 'C5', null, 'E5', 'D5', 'C5', null, 'A4', null, 'G4', null, 'A4', 'C5', 'E5', null]
const MELODY_ALERT = ['A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5', 'A4', 'B4', 'D5', 'F5', 'A5', 'G5', 'F5', 'E5', 'D5']
const BASS_PATTERN = ['A2', 'A2', 'C3', 'E3', 'A2', 'G2', 'A2', 'E2']

let melodySeq: Tone.Sequence | null = null
let bassSeq: Tone.Sequence | null = null
let kickSeq: Tone.Sequence | null = null
let hihatSeq: Tone.Sequence | null = null
let padPart: Tone.Part | null = null
let started = false

export function startMusic() {
  if (started) return
  started = true
  Tone.getTransport().bpm.value = BPM_NORMAL

  melodySeq = new Tone.Sequence((time, note) => { if (note) leadSynth.triggerAttackRelease(note, '16n', time) }, MELODY_NORMAL, '16n')
  bassSeq = new Tone.Sequence((time, note) => { bassSynth.triggerAttackRelease(note, '8n', time) }, BASS_PATTERN, '8n')
  kickSeq = new Tone.Sequence((time, a) => { if (a) kick.triggerAttackRelease('C1', '8n', time) }, [1, 0, 0, 0, 1, 0, 0, 0], '8n')
  hihatSeq = new Tone.Sequence((time, a) => { if (a) hihat.triggerAttackRelease('16n', time) }, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0], '16n')
  padPart = new Tone.Part((time, chord) => { padSynth.triggerAttackRelease(chord as string[], '2n', time) }, [
    [0, ['A3', 'C4', 'E4']], ['2m', ['F3', 'A3', 'C4']], ['4m', ['G3', 'B3', 'D4']], ['6m', ['A3', 'C4', 'E4']],
  ] as [Tone.Unit.Time, string[]][])
  padPart.loop = true; padPart.loopEnd = '8m'

  melodySeq.start(0); bassSeq.start(0); kickSeq.start(0); hihatSeq.start(0); padPart.start(0)
  const T = Tone.getTransport(); T.loop = true; T.loopEnd = '8m'; T.start()
}

export function stopMusic() {
  started = false
  Tone.getTransport().stop()
  melodySeq?.dispose(); bassSeq?.dispose(); kickSeq?.dispose(); hihatSeq?.dispose(); padPart?.dispose()
  melodySeq = bassSeq = kickSeq = hihatSeq = null; padPart = null
}

export function setMoodAlert(isAlert: boolean) {
  Tone.getTransport().bpm.rampTo(isAlert ? BPM_ALERT : BPM_NORMAL, 2)
  if (melodySeq) melodySeq.events = isAlert ? MELODY_ALERT : MELODY_NORMAL
}

export function playVictoryJingle() {
  const now = Tone.now()
  const j = new Tone.Synth({ oscillator: { type: 'square' }, volume: -10 }).connect(master)
  ;['C5', 'E5', 'G5', 'C6'].forEach((n, i) => j.triggerAttackRelease(n, '8n', now + i * 0.12))
  setTimeout(() => j.dispose(), 1000)
}
