# File Architecture

## Top-Level Flow

1. `scripts/extract.sh` gathers Git and GitHub data into `data/*.json`.
2. `src/data/loader.js` fetches those JSON snapshots in the browser and clips them to the densest activity window.
3. `src/main.js` initializes the transport, builds a density profile from all events, and boots the audio layers and visualization.
4. `src/layers/*.js` turn each data stream into scheduled Tone.js events, all sharing a common harmonic reference from the pad chord progression.
5. `src/viz/timeline.js` renders a live audio-reactive canvas (waveform + FFT spectrum) during playback.

## What Each File Does

### App shell
- **index.html** — UI shell: title, repo label, canvas container, play button, timer display, speed slider.
- **package.json** — Vite dev/build scripts; runtime dependency: `tone` (Tone.js handles all synthesis, scheduling, and DSP).
- **vite.config.js** — Minimal Vite configuration for local dev and build output.

### Data extraction and loading
- **scripts/extract.sh** — Pulls commit, PR, contributor, run, and metadata from GitHub CLI and local git; writes normalized JSON to `data/`.
- **data/commits.json** — Commit-level events (timestamp, files, lines added/deleted).
- **data/contributors.json** — Weekly grouped contributor activity used for the polyphony layer.
- **data/pulls.json** — Pull request timing and review-state data.
- **data/runs.json** — CI run events used for percussion and stress modulation.
- **data/meta.json** — Repo or user label shown in the interface.
- **src/data/loader.js** — Loads the JSON files, clips to the densest 70% of activity, and exposes the resulting time range.

### Audio infrastructure
- **src/audio/transport.js** — Global time mapping from real timestamps to transport seconds. Exports `tsToAudio()` and `quantizeTime()` (snaps event times to 16n / 8n / 4n grids at 120 BPM).
- **src/audio/scales.js** — Musical scales (Dorian, pentatonic, minor, major, Phrygian), root definitions, and numeric-to-pitch helpers (`valueToNote`, `mapToNotes`, `snapToScale`).
- **src/audio/voices.js** — Synth and drum factory functions. Used directly by the contributor (`Tone.Synth`), pad (`PolySynth` + filter + chorus), pulse (`MetalSynth` + highpass), and run (`MembraneSynth` kick + `NoiseSynth`) layers. The commit and pull layers build their FM/AM synths inline rather than using the factories here.
- **src/audio/mixer.js** — Master bus: compressor → EQ3 → stress low-pass filter → reverb → limiter → destination. Also exports `getAnalyser()` (waveform + FFT taps post-limiter) and `setStressLevel()` for CI-failure-driven filter automation.

### Musical layers
- **src/layers/commits.js** — The melodic engine. Chord tone chosen by commit churn; octave and timbre from dominant file extension (docs=high/bright, code=mid, data=low/dark). Dense slots become ascending chord arpeggios. Note duration scales with churn (16n / 8n / 4n). FM modulation index scales with velocity for dynamic timbre.
- **src/layers/contributors.js** — One `Tone.Synth` per top-6 contributor, panned evenly across the stereo field (-0.6 to +0.6). Each contributor is assigned a single fixed pitch from the D-dorian chord degrees `[0, 3, 7, 10, 2, 5]` and retriggers that note (quarter-note duration, velocity scaling with weekly commit count) on every week they were active.
- **src/layers/pulls.js** — PRs become AMSynth bell chimes at merge time (quantized to nearest quarter note). PR size drives how many chord tones ring (1–3 notes). Review decision sets octave (APPROVED=high, CHANGES_REQUESTED=low) and filter brightness.
- **src/layers/runs.js** — CI events become percussion: kick on success, kick + white-noise burst on failure. Rolling 10-run failure rate drives `setStressLevel()` on the master filter.
- **src/layers/pad.js** — Always-on ambient chord bed. Four-chord progression (Dm7 → G7 → Cmaj7 → Am7) in drop-2 voicings with held top voice for smooth voice leading. Exports `getProgression()`, `getActiveChordMidi(audioSec)`, and `getChordCount()` so melodic layers can align their pitches to the sounding harmony.
- **src/layers/pulse.js** — Always-on 8th-note ostinato. Each tick arpeggiates the chord currently sounding in the pad (top-three voices lifted two octaves) rather than repeating a fixed pitch. Velocity follows density; gated near-silent during quiet sections.

### Visualization
- **src/viz/timeline.js** — Audio-reactive canvas. During playback, draws a live waveform (from master-bus waveform analyser) overlaid on a frequency-spectrum bar chart (from FFT analyser), plus a progress strip at the bottom. Samples directly from the post-limiter signal so visuals are a literal picture of what the listener hears.

## How It Works Together

`src/main.js` is the coordinator. It loads the extracted data, clips it to the most active period, calls `initTransport()` so every module shares the same time mapping, and computes a density profile from all event types. That density profile is passed to the pad and pulse layers so the background texture responds to overall activity.

The pad layer is also the harmonic authority. It exports `getActiveChordMidi(audioSec)`, which returns the MIDI notes of whichever chord is sounding at a given moment. The commit and pull layers call this at each event time to snap their pitches to current chord tones — so melodic events always land in harmony with the ambient bed, regardless of where in the progression the transport has reached.

Once the user presses play, `main.js` starts Tone.js, creates the master mixer, initializes every layer, and starts the transport. Each layer schedules events independently against the shared transport. The visualization taps the post-limiter analysers and animates each frame from live audio data rather than from the raw event data, so the display reflects the processed sound the listener actually hears.
