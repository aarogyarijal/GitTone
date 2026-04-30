import * as Tone from 'tone'
import { makeRunVoice } from '../audio/voices.js'
import { tsToAudio, quantizeTime } from '../audio/transport.js'
import { setStressLevel } from '../audio/mixer.js'

const MAX_PER_SECOND = 24

let voice = null
let part  = null

export function initRuns(runs, master) {
  if (!runs?.length) return
  voice = makeRunVoice()
  voice.gain.connect(master)

  const sorted = [...runs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  let allEvents = sorted.map((run, i) => {
    const recent = sorted.slice(Math.max(0, i - 9), i + 1)
    const failRate = recent.filter(r => r.conclusion === 'failure').length / recent.length
    return {
      time:    quantizeTime(tsToAudio(new Date(run.createdAt).getTime()), '16n'),
      success: run.conclusion === 'success',
      failRate,
      weight:  run.conclusion === 'failure' ? 2 : 1,   // failures matter more
    }
  })

  // 300 runs in 5 audio seconds = unlistenable. Thin to MAX_PER_SECOND.
  allEvents = thinByDensity(allEvents, MAX_PER_SECOND)

  part = new Tone.Part((time, ev) => {
    setStressLevel(ev.failRate, time)
    if (ev.success) {
      voice.kick.triggerAttackRelease('C1', '4n', time, 0.7)
    } else {
      voice.kick.triggerAttackRelease('A0', '4n', time, 0.9)
      voice.noise.triggerAttackRelease('8n', time, 0.7)
    }
  }, allEvents.map(e => [Math.max(0, e.time), e]))

  part.start(0)
}

function thinByDensity(events, maxPerBin) {
  const bins = new Map()
  for (const ev of events) {
    const k = Math.floor(ev.time)
    if (!bins.has(k)) bins.set(k, [])
    bins.get(k).push(ev)
  }
  const kept = []
  for (const arr of bins.values()) {
    arr.sort((a, b) => b.weight - a.weight)
    kept.push(...arr.slice(0, maxPerBin))
  }
  return kept.sort((a, b) => a.time - b.time)
}
