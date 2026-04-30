import * as Tone from 'tone'
import { midiToName } from '../audio/scales.js'
import { tsToAudio, getAudioDuration, quantizeTime } from '../audio/transport.js'
import { getActiveChordMidi } from './pad.js'

// PRs sound at MERGE TIME as a short, bell-like AM event — punctuation, not a drone.
// The data shapes the sound:
//   - PR size       → how many chord tones ring (small=single note, large=triad)
//   - review state  → timbre brightness (APPROVED = bright bell, CHANGES_REQUESTED = darker)
//   - merge time    → quantized to nearest quarter note for rhythmic placement

let voice = null
let part  = null

export function initPulls(pulls, master) {
  if (!pulls?.length) return

  // AMSynth with a fast attack and natural decay — reads as a bell/celesta rather than a drone.
  voice = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 2,
    oscillator: { type: 'sine' },
    envelope:   { attack: 0.01, decay: 1.2, sustain: 0.0, release: 1.6 },
    modulation: { type: 'triangle' },
    modulationEnvelope: { attack: 0.02, decay: 0.5, sustain: 0, release: 0.5 },
    volume: -10,
  })
  const filter = new Tone.Filter(5000, 'lowpass')
  const reverb = new Tone.Reverb({ decay: 5, wet: 0.45 }).connect(master)
  voice.connect(filter)
  filter.connect(reverb)

  const merged = pulls.filter(pr => pr.mergedAt)
  if (!merged.length) return

  // Normalize PR size to [0,1] log-scale so a 5000-line PR doesn't drown out 50-line ones.
  const sizes  = merged.map(pr => (pr.additions || 0) + (pr.deletions || 0) || 1)
  const logSz  = sizes.map(s => Math.log1p(s))
  const minL   = Math.min(...logSz)
  const maxL   = Math.max(...logSz)
  const range  = (maxL - minL) || 1

  const audioDur = getAudioDuration()

  const events = merged.map((pr, i) => {
    const t       = quantizeTime(tsToAudio(new Date(pr.mergedAt).getTime()), '4n')
    const sizeN   = (logSz[i] - minL) / range          // 0..1
    const chord   = getActiveChordMidi(t)              // align with sounding pad chord
    const review  = pr.reviewDecision

    // Small PRs ring 1 note; medium 2; large 3 (a triad celebrating the merge).
    const noteCount = sizeN < 0.33 ? 1 : sizeN < 0.7 ? 2 : 3

    // Pick chord tones by size — small PRs sit on the root, big PRs reach for the 7th and 9th.
    const indices = pickChordIndices(noteCount, sizeN, chord.length)

    // Approved merges ring high & bright; changes_requested merges ring low & dark.
    const octShift = review === 'CHANGES_REQUESTED' ? -12 : review === 'APPROVED' ? 12 : 0
    const notes = indices.map(idx => midiToName(chord[idx] + octShift))

    return {
      time:       Math.min(t, audioDur - 0.5),
      notes,
      velocity:   0.3 + sizeN * 0.45,
      duration:   1.2 + sizeN * 1.0,
      filterFreq: review === 'APPROVED' ? 7000 : review === 'CHANGES_REQUESTED' ? 1800 : 4500,
    }
  })

  part = new Tone.Part((time, ev) => {
    filter.frequency.setValueAtTime(ev.filterFreq, time)
    voice.triggerAttackRelease(ev.notes, ev.duration, time, ev.velocity)
  }, events.map(e => [Math.max(0, e.time), e]))

  part.start(0)
}

// Choose `n` chord-tone indices weighted by PR size:
// small PRs lean on roots (idx 0), big PRs spread to 3rds, 5ths, 7ths.
function pickChordIndices(n, sizeN, chordLen) {
  const out = [0]
  if (n >= 2) out.push(Math.min(chordLen - 1, sizeN < 0.85 ? 2 : 3))
  if (n >= 3) out.push(Math.min(chordLen - 1, 1))
  return out
}
