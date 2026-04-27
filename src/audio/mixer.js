import * as Tone from 'tone'

// Audio processing chain: compressor (evens out volume) → EQ (tone shaping) → reverb (adds space) → limiter (hard ceiling) → output
// Layers plug into the input bus returned by initMixer / getMaster.

let busIn, compressor, eq, reverbBus, limiter, stressFilter

export function initMixer() {
  // Input bus (this is what layers connect to)
  busIn = new Tone.Gain(1)

  // Compressor — reduces the volume gap between loud and quiet moments
  compressor = new Tone.Compressor({
    threshold: -5,
    ratio:     3,
    attack:    0.01,
    release:   0.2,
  })

  // EQ — small low-mid cut to reduce muddiness, small high boost for clarity
  eq = new Tone.EQ3({ low: -2, mid: 0, high: 1.5, lowFrequency: 200, highFrequency: 5000 })

  // Stress filter — opens/closes based on CI failure rate
  stressFilter = new Tone.Filter(20000, 'lowpass', -12)

  // Reverb — adds simulated room ambience to the signal
  reverbBus = new Tone.Reverb({ decay: 3.5, wet: 0.30 })

  // Final limiter to prevent clipping
  limiter = new Tone.Limiter(-1)

  busIn.connect(compressor)
  compressor.connect(eq)
  eq.connect(stressFilter)
  stressFilter.connect(reverbBus)
  reverbBus.connect(limiter)
  limiter.toDestination()

  return busIn
}

export function getMaster() { return busIn }

// level [0,1]: 0 = filter fully open (bright/full sound), 1 = filter nearly closed (muffled)
export function setStressLevel(level) {
  if (!stressFilter) return
  const freq = 18000 - level * 14000
  stressFilter.frequency.rampTo(freq, 1.5)
}
