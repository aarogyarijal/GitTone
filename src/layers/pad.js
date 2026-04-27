import * as Tone from 'tone'
import { makePadVoice } from '../audio/voices.js'
import { getAudioDuration } from '../audio/transport.js'

// Pad — a slow chord sequence sustained across the full audio duration.
// Volume rises and falls with overall event activity (density profile).

let voice = null

// Four-chord loop in D dorian; each chord holds for ~22.5s of the 90s piece.
const PROGRESSION = [
  ['D2', 'F3', 'A3', 'C4'],   // Dm7  — minor 7th, tense/moody
  ['G2', 'B3', 'D4', 'F4'],   // G7   — dominant 7th, pulls toward resolution
  ['C2', 'E3', 'G3', 'B3'],   // Cmaj7 — major 7th, bright/floating
  ['A1', 'C3', 'E3', 'G3'],   // Am7  — minor 7th, returns to darker feel
]

export function initPad(densityProfile, master) {
  voice = makePadVoice()
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.45 }).connect(master)
  voice.gain.connect(reverb)

  const audioDur = getAudioDuration()
  const chordDur = audioDur / PROGRESSION.length   // each chord = ~22.5s of a 90s piece

  // Schedule chord progression
  PROGRESSION.forEach((chord, i) => {
    const start = i * chordDur
    Tone.getTransport().schedule((time) => {
      voice.synth.triggerAttackRelease(chord, chordDur + 1.5, time, 0.55)
    }, start)
  })

  // Volume scales with density: quiet periods sit at -22dB, busy periods rise to -14dB.
  // densityProfile is an array of normalized floats [0,1] per audio second.
  if (densityProfile?.length) {
    Tone.getTransport().scheduleRepeat((time) => {
      const sec = Math.floor(Tone.getTransport().seconds)
      const d   = densityProfile[Math.min(sec, densityProfile.length - 1)] ?? 0
      const targetDb = -22 + d * 8
      voice.synth.volume.rampTo(targetDb, 0.5, time)
      // Raise low-pass filter cutoff during busy periods for a brighter sound
      voice.filter.frequency.rampTo(800 + d * 2200, 0.5, time)
    }, 0.5)
  }
}
