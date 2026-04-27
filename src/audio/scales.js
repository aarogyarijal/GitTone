// Scale quantization: maps raw numeric values to valid note pitches within a chosen musical scale.
// All scales are expressed as semitone (half-step) offsets from the root note.

export const SCALES = {
  dorian:      [0, 2, 3, 5, 7, 9, 10],   // minor variant with a raised 6th — less dark than plain minor
  pentatonic:  [0, 2, 4, 7, 9],           // 5-note subset with no dissonant intervals — safe with anything
  minor:       [0, 2, 3, 5, 7, 8, 10],
  major:       [0, 2, 4, 5, 7, 9, 11],
  phrygian:    [0, 1, 3, 5, 7, 8, 10],   // starts on a half-step; sounds tense/dark
}

// Root notes as MIDI offsets (C4 = 60)
export const ROOTS = {
  C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71,
}

// Map a continuous value [0,1] to a MIDI note in the given scale + root.
// octaves controls range (e.g. 3 = 3 octaves = 21 scale steps).
export function valueToNote(value, scaleName = 'dorian', root = 'D', octaves = 3) {
  const intervals = SCALES[scaleName] ?? SCALES.dorian
  const rootMidi  = ROOTS[root] ?? 62
  const stepsPerOct = intervals.length
  const totalSteps  = stepsPerOct * octaves

  const step   = Math.round(value * (totalSteps - 1))
  const oct    = Math.floor(step / stepsPerOct)
  const degree = step % stepsPerOct
  return rootMidi + oct * 12 + intervals[degree]
}

// Convert MIDI note number to note name string ("D4", "A5", etc.)
export function midiToName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
  const oct = Math.floor(midi / 12) - 1
  return names[midi % 12] + oct
}

// Snap an arbitrary MIDI number to the nearest note in the scale.
export function snapToScale(midi, scaleName = 'dorian', root = 'D') {
  const intervals = SCALES[scaleName] ?? SCALES.dorian
  const rootMidi  = ROOTS[root] ?? 62
  const relative  = midi - rootMidi
  const octShift  = Math.floor(relative / 12)
  const semitone  = ((relative % 12) + 12) % 12
  const nearest   = intervals.reduce((best, s) =>
    Math.abs(s - semitone) < Math.abs(best - semitone) ? s : best, intervals[0])
  return rootMidi + octShift * 12 + nearest
}

// Map an array of values to MIDI notes, normalizing via log if useLog=true.
export function mapToNotes(values, opts = {}) {
  const { scaleName = 'dorian', root = 'D', octaves = 3, useLog = false } = opts
  const vals = useLog ? values.map(v => Math.log1p(v)) : values
  const min  = Math.min(...vals)
  const max  = Math.max(...vals)
  const range = max - min || 1
  return vals.map(v => valueToNote((v - min) / range, scaleName, root, octaves))
}
