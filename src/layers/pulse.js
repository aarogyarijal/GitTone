import * as Tone from 'tone'
import { makePulseVoice } from '../audio/voices.js'
import { getAudioDuration } from '../audio/transport.js'
import { getProgression } from './pad.js'

// Pulse — a steady tick that fires every half-beat (8th note at 120bpm = every 250ms).
// Volume scales with event density, and pitch arpeggiates the currently-sounding pad chord
// so the pulse is melodic content rather than a clock click.

let voice = null
let loop  = null
let densityRef = null

// Take the chord's top three voices, transpose up to a sparkle register.
// Returns an array of note name strings.
function arpFor(chord) {
  // Top three voices, lifted two octaves into MetalSynth's sweet spot.
  return chord.slice(1).map(n => shiftOctave(n, 2))
}

function shiftOctave(note, by = 1) {
  const m = note.match(/^([A-G]#?)(-?\d+)$/)
  if (!m) return note
  return `${m[1]}${parseInt(m[2], 10) + by}`
}

export function initPulse(densityProfile, master) {
  voice = makePulseVoice()
  voice.gain.connect(master)
  densityRef = densityProfile

  const progression = getProgression()
  const audioDur    = getAudioDuration()
  const chordDur    = audioDur / progression.length

  // Pre-compute the high-register arpeggio for each chord in the progression.
  const arps = progression.map(arpFor)

  let tick = 0
  loop = new Tone.Loop((time) => {
    const sec = Math.floor(Tone.getTransport().seconds)
    const d   = densityRef?.[Math.min(sec, densityRef.length - 1)] ?? 0

    // Quiet sections: very faint pulse. Busy sections: more present.
    const baseVel = 0.2 + d * 0.55
    const accent  = (tick % 4 === 0) ? 1.4 : (tick % 2 === 0 ? 1.0 : 0.7)
    const vel     = Math.min(1, baseVel * accent)

    // Pick the chord that's currently sounding under the pad, then walk its arpeggio.
    const chordIdx = Math.min(arps.length - 1, Math.floor(sec / chordDur))
    const arp      = arps[chordIdx]
    const note     = arp[tick % arp.length]

    voice.synth.triggerAttackRelease(note, '32n', time, vel)
    tick++
  }, '8n')

  loop.start(0)

  Tone.getTransport().scheduleOnce(() => loop?.stop(), getAudioDuration())
}
