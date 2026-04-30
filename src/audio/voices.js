import * as Tone from 'tone'

// One factory per layer. Returns { synth, gain } ready to connect to a bus.

export function makeCommitVoice() {
  // Replaced inside layers/commits.js with an FM synth, but the gain is reused.
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope:   { attack: 0.02, decay: 0.4, sustain: 0.5, release: 1.8 },
    volume: -1,
  })
  const gain = new Tone.Gain(1)
  synth.connect(gain)
  return { synth, gain }
}

export function makeContributorVoice(index) {
  const types = ['sine', 'triangle', 'sawtooth', 'square', 'triangle']
  const synth = new Tone.Synth({
    oscillator: { type: types[index % types.length] },
    envelope:   { attack: 0.15, decay: 0.6, sustain: 0.8, release: 4.5 },
    volume: -16,
  })
  const gain = new Tone.Gain(1)
  synth.connect(gain)
  return { synth, gain }
}

export function makePullVoice() {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope:   { attack: 0.3, decay: 0.6, sustain: 0.75, release: 5 },
    volume: -15,
  })
  const gain = new Tone.Gain(1)
  synth.connect(gain)
  return { synth, gain }
}

export function makeRunVoice() {
  const kick  = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, volume: 0 })
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.12 },
    volume: -15,
  })
  const gain = new Tone.Gain(1)
  kick.connect(gain)
  noise.connect(gain)
  return { kick, noise, gain }
}

// Pad — a sustained chord layer that runs continuously, filling silence between events.
export function makePadVoice() {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', spread: 30, count: 3 },
    envelope:   { attack: 2.5, decay: 1, sustain: 0.9, release: 4 },
    volume: -22,
  })
  const filter = new Tone.Filter(1200, 'lowpass')
  const chorus = new Tone.Chorus(0.4, 4, 0.6).start()
  const gain   = new Tone.Gain(1)
  synth.connect(filter)
  filter.connect(chorus)
  chorus.connect(gain)
  return { synth, gain, filter }
}

// Pulse — a steady metallic tick on every half-beat throughout the piece, like a clock.
export function makePulseVoice() {
  const synth = new Tone.MetalSynth({
    envelope:    { attack: 0.001, decay: 0.04, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 12,
    resonance: 800,
    octaves: 1.5,
    volume: -18,
  })
  const filter = new Tone.Filter(8000, 'highpass')
  const gain   = new Tone.Gain(1)
  synth.connect(filter)
  filter.connect(gain)
  return { synth, gain }
}
