import * as Tone from 'tone'
import { makePadVoice } from '../audio/voices.js'
import { getAudioDuration } from '../audio/transport.js'

// MIDI cache so harmonic-aware layers (commits, pulls, pulse) can ask
// "what chord is sounding right now?" without re-parsing note strings.
let PROGRESSION_MIDI = null

export function getActiveChordMidi(audioSec) {
  if (!PROGRESSION_MIDI) {
    PROGRESSION_MIDI = PROGRESSION.map(chord => chord.map(n => Tone.Frequency(n).toMidi()))
  }
  const dur = getAudioDuration() / PROGRESSION_MIDI.length
  const idx = Math.max(0, Math.min(PROGRESSION_MIDI.length - 1, Math.floor(audioSec / dur)))
  return PROGRESSION_MIDI[idx]
}

// Pad — a slow chord sequence sustained across the full audio duration.
// Volume rises and falls with overall event activity (density profile).

let voice = null

// Four-chord loop in D dorian; each chord holds for ~22.5s of the 90s piece.
// Drop-2 voicings (2nd-from-top voice dropped an octave) for a more open sound,
// with smooth top-voice motion (F → F → E → C) so the chord changes glide rather than jump.
const PROGRESSION = [
  ['D2', 'A2', 'C4', 'F4'],   // Dm7   — drop-2, top: F
  ['G2', 'D3', 'B3', 'F4'],   // G7    — drop-2, top: F (held over Dm7→G7)
  ['C2', 'G2', 'B3', 'E4'],   // Cmaj7 — drop-2, top: E (half-step down from F)
  ['A1', 'E3', 'G3', 'C4'],   // Am7   — drop-2, top: C (smooth from E)
]

export function getProgression() { return PROGRESSION }
export function getChordCount()  { return PROGRESSION.length }

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
