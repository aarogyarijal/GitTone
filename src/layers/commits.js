import * as Tone from 'tone'
import { makeCommitVoice } from '../audio/voices.js'
import { midiToName, mapToNotes } from '../audio/scales.js'
import { tsToAudio } from '../audio/transport.js'

const FILE_TYPE_PAN = { js: -0.4, ts: -0.4, py: -0.3, rs: -0.2, md: 0.4, txt: 0.4, json: 0.2, css: 0.3 }

const MAX_PER_SECOND = 6   // cap density so peak seconds (125 commits in sec 89) become listenable.

let voice = null
let part  = null

export function initCommits(commits, master) {
  if (!commits?.length) return

  // Swap plain oscillator for an FM synth (frequency modulation) — richer, less harsh tone.
  voice = makeCommitVoice()
  voice.synth.dispose()
  voice.synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 4,
    oscillator: { type: 'triangle' },
    envelope:   { attack: 0.02, decay: 0.4, sustain: 0.5, release: 1.8 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.5, decay: 0.5, sustain: 0.2, release: 1.2 },
    volume: -12,
  })

  const panner = new Tone.Panner(0)
  const reverb = new Tone.Reverb({ decay: 2, wet: 0.25 }).connect(master)
  voice.synth.connect(panner)
  panner.connect(reverb)
  voice.gain.disconnect()

  // Note pitch (frequency) driven by commit churn size
  const churns = commits.map(c => c.linesAdded || c.linesDeleted || 1)
  const notes  = mapToNotes(churns, { scaleName: 'dorian', root: 'D', octaves: 3, useLog: true })

  const allEvents = commits.map((c, i) => {
    const ext = dominantExtension(c.files || [])
    const pan = FILE_TYPE_PAN[ext] ?? 0
    const churn = c.linesAdded + c.linesDeleted
    const vel = Math.min(1, 0.3 + Math.log1p(churn) / 10)
    return {
      time:     tsToAudio(c.timestamp * 1000),
      note:     midiToName(notes[i]),
      velocity: vel,
      pan,
      duration: '8n',
    }
  })

  // Density cap: keep at most MAX_PER_SECOND commits per audio second,
  // prioritized by velocity (loudest churn wins).
  const events = thinByDensity(allEvents, MAX_PER_SECOND)

  // Add tiny random time/volume jitter so rapid bursts don't sound like a perfectly aligned grid.
  for (const ev of events) {
    ev.time     += (Math.random() - 0.5) * 0.04
    ev.velocity *= 0.9 + Math.random() * 0.2
  }

  part = new Tone.Part((time, ev) => {
    panner.pan.setValueAtTime(ev.pan, time)
    voice.synth.triggerAttackRelease(ev.note, ev.duration, time, ev.velocity)
  }, events.map(e => [Math.max(0, e.time), e]))

  part.start(0)
}

function dominantExtension(files) {
  const counts = {}
  for (const f of files) {
    const ext = f.split('.').pop().toLowerCase()
    counts[ext] = (counts[ext] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'js'
}

// Bucket events into 1-sec bins; keep top-N by velocity in each bin.
function thinByDensity(events, maxPerBin) {
  const bins = new Map()
  for (const ev of events) {
    const k = Math.floor(ev.time)
    if (!bins.has(k)) bins.set(k, [])
    bins.get(k).push(ev)
  }
  const kept = []
  for (const arr of bins.values()) {
    arr.sort((a, b) => b.velocity - a.velocity)
    kept.push(...arr.slice(0, maxPerBin))
  }
  return kept.sort((a, b) => a.time - b.time)
}
