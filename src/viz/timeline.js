import * as Tone from 'tone'
import { getAnalyser } from '../audio/mixer.js'
import { getAudioDuration } from '../audio/transport.js'

// Music-driven visualization: renders the live audio output (waveform +
// frequency spectrum) instead of plotting raw data points. Everything you see
// here is sampled directly from the master bus, so the visuals are a literal
// picture of the sound being produced.

const H = 160
const COLORS = {
  wave:     '#7c6af7',
  spec:     '#4fcfb4',
  specGlow: 'rgba(79, 207, 180, 0.18)',
  progress: 'rgba(255, 255, 255, 0.55)',
  axis:     'rgba(255, 255, 255, 0.06)',
}

let canvas, ctx, raf, width, audioDur, analyser

export function initTimeline(container) {
  // Remove the old static SVG — the viz is now fully audio-driven.
  const svgEl = container.querySelector('#timeline-svg')
  if (svgEl) svgEl.remove()

  width = container.clientWidth || 900
  const dpr = window.devicePixelRatio || 1

  canvas = document.createElement('canvas')
  canvas.width  = width * dpr
  canvas.height = H * dpr
  canvas.style.width  = width + 'px'
  canvas.style.height = H + 'px'
  canvas.style.display = 'block'
  container.appendChild(canvas)

  ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  // Idle frame so the panel isn't empty before play.
  drawIdle()
}

function drawIdle() {
  ctx.clearRect(0, 0, width, H)
  ctx.strokeStyle = COLORS.axis
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, H / 2)
  ctx.lineTo(width, H / 2)
  ctx.stroke()
}

export function startPlayhead() {
  audioDur = getAudioDuration()
  analyser = getAnalyser()

  function tick() {
    const wave = analyser.wave.getValue()
    const fft  = analyser.fft.getValue()

    ctx.clearRect(0, 0, width, H)

    // --- Spectrum bars (bottom half) ---
    const bars = fft.length
    const bw   = width / bars
    for (let i = 0; i < bars; i++) {
      // FFT values are in dB, roughly -100..0. Map to 0..1.
      const v = Math.max(0, Math.min(1, (fft[i] + 100) / 90))
      const h = v * (H * 0.55)
      ctx.fillStyle = `rgba(79, 207, 180, ${0.25 + v * 0.65})`
      ctx.fillRect(i * bw, H - h, Math.max(1, bw - 1.5), h)
    }

    // --- Waveform (centered, full width) ---
    ctx.beginPath()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = COLORS.wave
    const N = wave.length
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * width
      const y = H / 2 + wave[i] * (H * 0.42)
      if (i === 0) ctx.moveTo(x, y)
      else         ctx.lineTo(x, y)
    }
    ctx.stroke()

    // --- Progress strip (very bottom) ---
    const t  = Tone.getTransport().seconds
    const px = Math.min(width, (t / audioDur) * width)
    ctx.fillStyle = COLORS.progress
    ctx.fillRect(0, H - 2, px, 2)

    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

export function stopPlayhead() {
  if (raf) cancelAnimationFrame(raf)
  raf = null
}
