import * as Tone from 'tone'
import { midiToName } from '../audio/scales.js'
import { tsToAudio, quantizeTime } from '../audio/transport.js'
import { getActiveChordMidi } from './pad.js'

// Commits are the melodic engine. Every musical decision pulls from the commit data:
//   - file extension     → octave register + stereo pan + timbre brightness
//   - churn (lines)      → chord-tone choice + velocity + note duration + FM modulation index
//   - density (per slot) → bursts become ascending arpeggios on the active chord
// All notes are chord-tones of whatever pad chord is sounding, so every commit sits in harmony.

const EXT_PAN = { js: -0.4, ts: -0.4, py: -0.3, rs: -0.2, md: 0.4, txt: 0.4, json: 0.2, css: 0.3 }

// Octave shift (semitones) added on top of the chord-tone base register.
// Docs sit high and airy; code sits in the mid range; data files sit low.
const EXT_OCT = { md: 24, txt: 24, json: 0, css: 12, js: 12, ts: 12, py: 12, rs: 12, html: 12 }

// Per-extension timbre tweaks (FM modulation index, harmonicity).
// Docs ring brighter/cleaner; data files come in darker; code sits in the middle.
const EXT_TIMBRE = {
  md:   { mod: 2,  harm: 3 },
  txt:  { mod: 2,  harm: 3 },
  json: { mod: 8,  harm: 1.5 },
  css:  { mod: 4,  harm: 2 },
  js:   { mod: 4,  harm: 2 },
  ts:   { mod: 4,  harm: 2 },
  py:   { mod: 5,  harm: 2 },
  rs:   { mod: 6,  harm: 2 },
}

const MAX_PER_SECOND = 6

let synth   = null
let panner  = null
let part    = null

export function initCommits(commits, master) {
  if (!commits?.length) return

  synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 4,
    oscillator: { type: 'triangle' },
    envelope:   { attack: 0.01, decay: 0.35, sustain: 0.35, release: 1.4 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.2, release: 1.0 },
    volume: -11,
  })

  panner = new Tone.Panner(0)
  const reverb = new Tone.Reverb({ decay: 2.4, wet: 0.28 }).connect(master)
  synth.connect(panner)
  panner.connect(reverb)

  const churns  = commits.map(c => (c.linesAdded || 0) + (c.linesDeleted || 0) || 1)
  const logCh   = churns.map(c => Math.log1p(c))
  const minL    = Math.min(...logCh)
  const maxL    = Math.max(...logCh)
  const range   = (maxL - minL) || 1

  // Build raw events (one per commit).
  const raw = commits.map((c, i) => {
    const ext     = dominantExtension(c.files || [])
    const churnN  = (logCh[i] - minL) / range                                    // 0..1
    const time    = quantizeTime(tsToAudio(c.timestamp * 1000), '16n')
    const chord   = getActiveChordMidi(time)
    const toneIdx = pickChordToneIdx(churnN, chord.length)
    const baseMidi = (chord[toneIdx] % 12) + 48                                  // park in C3..B3 register
    const midi    = baseMidi + (EXT_OCT[ext] ?? 12)
    const timbre  = EXT_TIMBRE[ext] ?? { mod: 4, harm: 2 }
    return {
      time,
      ext,
      midi,
      churnN,
      pan:      EXT_PAN[ext] ?? 0,
      velocity: 0.35 + Math.pow(churnN, 0.6) * 0.55,                             // square-rooted dynamics curve
      duration: churnN < 0.3 ? '16n' : churnN < 0.7 ? '8n' : '4n',               // big commits sustain
      modIndex: timbre.mod + churnN * 6,                                         // loud commits get brassier
      harm:     timbre.harm,
    }
  })

  // Group by 16n slot. Within a crowded slot, spread the events into an
  // ascending arpeggio across consecutive 16ths instead of stacking them.
  const slotted = new Map()
  for (const ev of raw) {
    const key = Math.round(ev.time / 0.125)
    if (!slotted.has(key)) slotted.set(key, [])
    slotted.get(key).push(ev)
  }

  const events = []
  for (const [slot, arr] of slotted.entries()) {
    arr.sort((a, b) => b.velocity - a.velocity)
    const keep = arr.slice(0, MAX_PER_SECOND)                                    // drop the quietest if overcrowded
    if (keep.length === 1) {
      events.push(keep[0])
    } else {
      // Arpeggiate: re-pitch the cluster to ascending chord tones, spread across 16ths.
      const chord = getActiveChordMidi(keep[0].time)
      keep.sort((a, b) => a.churnN - b.churnN)                                   // small churn at bottom of arp
      keep.forEach((ev, i) => {
        const tone = chord[i % chord.length] % 12
        const octBoost = Math.floor(i / chord.length) * 12
        ev.time = slot * 0.125 + i * 0.125
        ev.midi = 48 + tone + (EXT_OCT[ev.ext] ?? 12) + octBoost
        ev.duration = '16n'
        ev.velocity = Math.min(1, ev.velocity * 0.85)                             // arpeggio hits softer than solo notes
        events.push(ev)
      })
    }
  }

  events.sort((a, b) => a.time - b.time)

  // Tiny humanization so quantized notes don't feel mechanical.
  for (const ev of events) {
    ev.time     += (Math.random() - 0.5) * 0.015
    ev.velocity *= 0.92 + Math.random() * 0.16
  }

  part = new Tone.Part((time, ev) => {
    panner.pan.setValueAtTime(ev.pan, time)
    synth.set({ modulationIndex: ev.modIndex, harmonicity: ev.harm })
    synth.triggerAttackRelease(midiToName(ev.midi), ev.duration, time, ev.velocity)
  }, events.map(e => [Math.max(0, e.time), e]))

  part.start(0)
}

// Pick which chord tone to play. Small commits land on root/5th (consonant),
// medium on 3rd/7th (chord identity), large on the highest tones (color).
function pickChordToneIdx(churnN, chordLen) {
  if (churnN < 0.3)  return 0
  if (churnN < 0.55) return Math.min(chordLen - 1, 2)
  if (churnN < 0.85) return Math.min(chordLen - 1, 1)
  return chordLen - 1
}

function dominantExtension(files) {
  const counts = {}
  for (const f of files) {
    const ext = f.split('.').pop().toLowerCase()
    counts[ext] = (counts[ext] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'js'
}
