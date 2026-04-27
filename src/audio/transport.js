import * as Tone from 'tone'

// The data timeline is compressed to a target audio duration.
// Every layer converts its event timestamps to Tone.js time using this.

let _dataStart = 0   // unix ms
let _dataEnd   = 0   // unix ms
let _audioDur  = 60  // seconds (default; gets overridden)

export function initTransport(dataStartMs, dataEndMs, audioDurationSecs = 60) {
  _dataStart = dataStartMs
  _dataEnd   = dataEndMs
  _audioDur  = audioDurationSecs

  Tone.getTransport().bpm.value = 120
  Tone.getTransport().loop      = false
}

// Convert a Unix timestamp (ms) to Tone.js audio time (seconds from Transport 0).
export function tsToAudio(unixMs) {
  const fraction = (unixMs - _dataStart) / (_dataEnd - _dataStart)
  return Math.max(0, fraction * _audioDur)
}

export function getAudioDuration() { return _audioDur }
export function getDataStart()     { return _dataStart }
export function getDataEnd()       { return _dataEnd }
