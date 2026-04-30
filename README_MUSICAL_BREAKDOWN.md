# Musical Breakdown

## Core Idea

MUSCI is a sonification project that turns GitHub activity into a short electronic composition. Instead of treating a repository as static documentation, the project treats commits, pull requests, contributors, and CI runs as performance data. The full activity history is compressed into a fixed 90-second piece, so musical form emerges from density, timing, contrast, and harmony rather than from a traditional score.

## Time Design

The most important structural move happens before any sound is made. `clipToDenseWindow()` in `src/data/loader.js` keeps the densest recent 70% of events and drops sparse early history. Every retained timestamp is then mapped onto a 90-second transport in `src/audio/transport.js` via `tsToAudio()`. Event times are subsequently snapped to a beat grid using `quantizeTime()` — commits and CI runs to the nearest 16th note, PRs to the nearest quarter note — so activity density resolves into rhythm rather than hail. The composition preserves event order and relative spacing while translating large spans of real time into a concentrated, listenable window.

## Harmonic Language

The piece is centered on D dorian, defined in `src/audio/scales.js`. D dorian sits between dark and bright — minor enough to feel reflective, but the raised sixth keeps it from becoming heavy. The pad layer (`src/layers/pad.js`) is the harmonic authority: it runs a four-chord progression (Dm7 → G7 → Cmaj7 → Am7) in drop-2 voicings with a deliberately held top voice (F → F → E → C) so chord changes glide rather than jump. Every other melodic layer consults `getActiveChordMidi()` to pick its pitches from whichever chord is sounding, meaning the entire piece shares one harmonic frame at all times.

## Layer-to-Music Mapping

**`commits.js` — the melodic engine.**
Commit churn determines which chord tone to play: small commits land on the root or fifth (consonant, stable), medium commits land on the third or seventh (chord identity), and large commits reach the upper extensions (color). The dominant file extension in that commit sets octave register and timbre independently — documentation files ring high and bright (low FM modulation index), source code sits in the mid range, data and config files sit low and darker. When three or more commits land in the same 16th-note slot, they are spread across consecutive 16ths as an ascending chord arpeggio, turning density spikes into musical runs. Note duration also scales with churn (16th, 8th, or quarter) so large commits naturally sustain longer.

**`contributors.js` — the harmonic chorus.**
The top six contributors are each assigned a fixed chord tone and panned to an even position across the stereo field. Each active week retriggers their voice. Because their pitches are drawn from the pad's chord degrees, multiple contributors playing at once reinforce the current harmony rather than competing with it.

**`pulls.js` — punctuation.**
Pull requests were previously long sawtooth drones that accumulated into an overwhelming wash. Now they sound at merge time as short AMSynth bell chimes: fast attack, 1.2-second decay, no sustain. PR size determines richness — small PRs ring a single chord tone, medium PRs ring two, large PRs ring a triad. Review decision shifts the register: APPROVED merges ring a bright octave higher with an open filter; CHANGES_REQUESTED merges ring a dark octave lower with a nearly-closed filter. The result is a layer of punctuation that marks significant moments without filling space between them.

**`runs.js` — percussion and tension.**
CI runs become percussion: a kick on success, a heavier kick plus white-noise burst on failure. A rolling ten-run failure rate drives `setStressLevel()`, which closes the master low-pass filter at `src/audio/mixer.js`, gradually darkening the entire mix during bad CI periods and brightening again as runs recover.

**`pad.js` — foundation.**
The ambient chord bed sustains continuously, swelling louder during busy periods and receding during quiet ones. Its drop-2 voicings space the chord tones across four octaves, giving the pad an open, airy quality rather than the dense mid-range cluster that root-position chords produce.

**`pulse.js` — ostinato.**
An eighth-note loop fires throughout the piece. Rather than repeating a fixed pitch, it arpeggiates the top three voices of the currently-sounding pad chord, transposed two octaves up. The result is a melodic ostinato that changes with each chord change and knits the pad and pulse layers into a single texture.

## Dynamics and Form

`buildDensityProfile()` in `src/main.js` combines events from all layers into a normalized activity curve smoothed over an 11-second rolling window. The pad and pulse layers use this to swell in busier sections and soften in quiet ones. The mix therefore breathes according to aggregate development intensity: active sprints push the texture forward, quiet periods let the pad and pulse hold space, and CI failure periods darken the whole mix tonally.

## Visualization

The visual layer is audio-reactive rather than data-driven. `src/viz/timeline.js` draws a live waveform and frequency-spectrum bar chart sampled directly from post-limiter analysers on the master bus. The display is a literal picture of the processed audio signal — what you see is exactly what you hear — rather than a representation of the underlying data events.

## Why It Works Musically

The project balances data fidelity with listenability at every layer. Density caps keep burst periods from becoming noise. Beat-grid quantization turns irregular event timing into rhythm. Chord-tone pitch selection ensures every melodic event fits the current harmony. Drop-2 voicings open the pad's register. The mixer glues the layers with compression, EQ, reverb, and limiting. The result is less like a spreadsheet with speakers and more like a composed interpretation of software labor — specific enough to carry real data, structured enough to feel like music.
