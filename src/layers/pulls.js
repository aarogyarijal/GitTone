import * as Tone from 'tone'
import { makePullVoice } from '../audio/voices.js'
import { midiToName, mapToNotes } from '../audio/scales.js'
import { tsToAudio, getAudioDuration } from '../audio/transport.js'

let voice = null
let part  = null

const FILTER_FREQ = {
  APPROVED: 8000,
  CHANGES_REQUESTED: 1200,
  null: 6000,
  undefined: 6000,
}

const MIN_DRONE_SECS = 4   // each PR's sustained tone plays for at least this many seconds, regardless of how fast it merged.

export function initPulls(pulls, master) {
  if (!pulls?.length) return
  voice = makePullVoice()
  // Long attack (slow fade-in) so PR tones ease in gradually rather than clicking on abruptly.
  voice.synth.set({ envelope: { attack: 1.2, decay: 0.8, sustain: 0.85, release: 6 } })

  const filter = new Tone.Filter(6000, 'lowpass').connect(master)
  const reverb = new Tone.Reverb({ decay: 4, wet: 0.4 }).connect(filter)
  voice.gain.connect(reverb)

  const merged = pulls.filter(pr => pr.mergedAt)
  if (!merged.length) return

  const sizes = merged.map(pr => (pr.additions || 0) + (pr.deletions || 0) || 1)
  const notes = mapToNotes(sizes, { scaleName: 'dorian', root: 'D', octaves: 2, useLog: true })

  const audioDur = getAudioDuration()

  const events = merged.map((pr, i) => {
    const start  = tsToAudio(new Date(pr.createdAt).getTime())
    const end    = tsToAudio(new Date(pr.mergedAt).getTime())
    const open   = Math.max(0, end - start)
    // Floor at MIN_DRONE_SECS so PRs always hold; cap so they don't run past piece end.
    const dur    = Math.min(audioDur - start, Math.max(MIN_DRONE_SECS, open + 2))
    return {
      time:       start,
      note:       midiToName(notes[i]),
      duration:   dur,
      velocity:   0.35,
      filterFreq: FILTER_FREQ[pr.reviewDecision] ?? 6000,
    }
  })

  part = new Tone.Part((time, ev) => {
    filter.frequency.setValueAtTime(ev.filterFreq, time)
    voice.synth.triggerAttackRelease(ev.note, ev.duration, time, ev.velocity)
  }, events.map(e => [e.time, e]))

  part.start(0)
}
