import * as Tone from 'tone'
import { makeContributorVoice } from '../audio/voices.js'
import { midiToName, ROOTS, SCALES } from '../audio/scales.js'
import { tsToAudio } from '../audio/transport.js'

// Each contributor is assigned a fixed note from the D-dorian chord tones
// so all contributor tones are musically compatible and don't clash.
const CHORD_DEGREES = [0, 3, 7, 10, 2, 5]  // semitone offsets from D that form the Dorian chord
const ROOT_MIDI = ROOTS['D']  // 62

let parts  = []
let voices = []

export function initContributors(contributors, master) {
  if (!contributors?.length) return

  // contributors: [{ author, weeks: [{w (unix s), a, d, c}] }]
  // Take top 6 by total commits
  const sorted = [...contributors]
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  const N = sorted.length
  sorted.forEach((contributor, idx) => {
    const voice  = makeContributorVoice(idx)
    // Spread voices across the stereo field so simultaneous contributors don't
    // mask each other — leftmost author at -0.6, rightmost at +0.6.
    const panAmt = N > 1 ? -0.6 + idx * (1.2 / (N - 1)) : 0
    const panner = new Tone.Panner(panAmt)
    const reverb = new Tone.Reverb({ decay: 2, wet: 0.3 }).connect(master)
    voice.gain.connect(panner)
    panner.connect(reverb)
    voices.push(voice)

    const pitchMidi = ROOT_MIDI + 12 + CHORD_DEGREES[idx % CHORD_DEGREES.length]
    const noteName  = midiToName(pitchMidi)

    const events = contributor.weeks
      .filter(w => w.c > 0)
      .map(w => ({
        time:     tsToAudio(w.w * 1000),
        note:     noteName,
        velocity: Math.min(1, 0.2 + w.c / 10),
        duration: '4n',
      }))

    if (!events.length) return

    const part = new Tone.Part((time, ev) => {
      voice.synth.triggerAttackRelease(ev.note, ev.duration, time, ev.velocity)
    }, events.map(e => [e.time, e]))

    part.start(0)
    parts.push(part)
  })
}
