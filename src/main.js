import * as Tone from 'tone'
import { loadAll, clipToDenseWindow } from './data/loader.js'
import { initTransport, getAudioDuration } from './audio/transport.js'
import { initMixer } from './audio/mixer.js'
import { initCommits } from './layers/commits.js'
import { initContributors } from './layers/contributors.js'
import { initPulls } from './layers/pulls.js'
import { initRuns } from './layers/runs.js'
import { initPad } from './layers/pad.js'
import { initPulse } from './layers/pulse.js'
import { initTimeline, startPlayhead, stopPlayhead } from './viz/timeline.js'

const AUDIO_DURATION = 90

const loadingEl    = document.getElementById('loading')
const timelineContainer = document.getElementById('timeline-container')
const controlsEl   = document.getElementById('controls')
const playBtn      = document.getElementById('play-btn')
const timeDisplay  = document.getElementById('time-display')
const repoLabel    = document.getElementById('repo-label')
const speedSlider  = document.getElementById('speed-slider')
const speedLabel   = document.getElementById('speed-label')

let playing     = false
let initialized = false

async function boot() {
  loadingEl.textContent = 'Loading data…'

  const raw = await loadAll()

  // Auto-detect the dense end-window of activity: skip sparse early years
  // and zoom in on the recent stretch where most events happened.
  const KEEP_FRACTION = 0.7
  const { data, start, end } = clipToDenseWindow(raw, KEEP_FRACTION)

  if (raw.meta?.repo) {
    const startStr = new Date(start).toISOString().slice(0, 7)
    const endStr   = new Date(end).toISOString().slice(0, 7)
    repoLabel.textContent = `${raw.meta.repo}  ·  ${startStr} → ${endStr}`
  }

  loadingEl.classList.add('hidden')
  timelineContainer.style.display = ''
  controlsEl.style.display = ''

  // Initialise transport metadata up front so the timeline's scale is correct
  // (no audio is created here — that happens after the user-gesture inside PLAY).
  initTransport(start, end, AUDIO_DURATION)

  initTimeline(timelineContainer, data)

  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value)
    speedLabel.textContent = `${val}×`
    Tone.getTransport().bpm.value = 120 * val
    // Note: Part schedule times don't auto-rescale with BPM, so speed slider
    // primarily affects the pulse layer's tempo. Acceptable trade-off.
  })

  playBtn.addEventListener('click', async () => {
    await Tone.start()

    if (!initialized) {
      const master = initMixer()

      // Build the density profile (events per audio second) — controls volume of pad and pulse layers.
      const density = buildDensityProfile(data, start, end, AUDIO_DURATION)

      // Always-on layers must be scheduled first so they attach to the audio timeline before playback starts.
      initPad(density, master)
      initPulse(density, master)

      // Event-driven layers
      initCommits(data.commits, master)
      initContributors(data.contributors, master)
      initPulls(data.pulls, master)
      initRuns(data.runs, master)

      Tone.getTransport().scheduleOnce(() => {
        Tone.getTransport().stop()
        Tone.getTransport().position = 0
        playBtn.textContent = 'PLAY'
        playBtn.classList.remove('playing')
        playing = false
        stopPlayhead()
      }, AUDIO_DURATION + 1)

      initialized = true
    }

    if (playing) {
      Tone.getTransport().pause()
      playBtn.textContent = 'PLAY'
      playBtn.classList.remove('playing')
      stopPlayhead()
      playing = false
    } else {
      Tone.getTransport().start()
      playBtn.textContent = 'PAUSE'
      playBtn.classList.add('playing')
      startPlayhead()
      playing = true
    }
  })

  setInterval(() => {
    const t = Tone.getTransport().seconds
    timeDisplay.textContent = `${fmt(t)} / ${fmt(AUDIO_DURATION)}`
  }, 250)
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// Compute normalized [0,1] event density per audio second.
// Smooths with an 11-second rolling window (±5s) to avoid abrupt spikes in the density curve.
function buildDensityProfile(data, dataStart, dataEnd, audioDur) {
  const counts = new Array(audioDur).fill(0)
  const total = dataEnd - dataStart || 1
  const toSec = (ts) => Math.floor(((ts - dataStart) / total) * audioDur)

  for (const c of data.commits)      bump(toSec(c.timestamp * 1000), 1)
  for (const c of data.contributors) for (const w of c.weeks) if (w.c > 0) bump(toSec(w.w * 1000), 0.5)
  for (const p of data.pulls)        bump(toSec(new Date(p.createdAt).getTime()), 0.5)
  for (const r of data.runs)         bump(toSec(new Date(r.createdAt).getTime()), 0.3)

  function bump(s, w) { if (s >= 0 && s < audioDur) counts[s] += w }

  // Rolling avg, 11s window (±5)
  const W = 5
  const smoothed = counts.map((_, i) => {
    let sum = 0, n = 0
    for (let j = Math.max(0, i - W); j <= Math.min(audioDur - 1, i + W); j++) { sum += counts[j]; n++ }
    return sum / n
  })

  const peak = Math.max(...smoothed) || 1
  return smoothed.map(v => Math.min(1, v / peak))
}

boot()
