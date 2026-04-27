import * as Tone from 'tone'
import { makePulseVoice } from '../audio/voices.js'
import { getAudioDuration } from '../audio/transport.js'

// Pulse — a steady tick that fires every half-beat (8th note at 120bpm = every 250ms).
// Volume scales with event density: quieter during low-activity periods.

let voice = null
let loop  = null
let densityRef = null

export function initPulse(densityProfile, master) {
  voice = makePulseVoice()
  voice.gain.connect(master)
  densityRef = densityProfile

  // Slight timing variation: off-beats fire slightly late, giving a loose rather than rigid feel.
  let tick = 0
  loop = new Tone.Loop((time) => {
    const sec = Math.floor(Tone.getTransport().seconds)
    const d   = densityRef?.[Math.min(sec, densityRef.length - 1)] ?? 0

    // Quiet sections: very faint pulse. Busy sections: more present.
    const baseVel = 0.2 + d * 0.55
    const accent  = (tick % 4 === 0) ? 1.4 : (tick % 2 === 0 ? 1.0 : 0.7)
    const vel     = Math.min(1, baseVel * accent)

    voice.synth.triggerAttackRelease('32n', time, vel)
    tick++
  }, '8n')   // fires every half-beat; at 120bpm that's every 250ms

  loop.start(0)

  Tone.getTransport().scheduleOnce(() => loop?.stop(), getAudioDuration())
}
