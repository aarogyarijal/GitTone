# Musical Breakdown

## Core Idea
`MUSCI` is a sonification project that turns GitHub activity into a short electronic composition. Instead of treating the repository as static documentation, the project treats commits, pull requests, contributors, and CI runs as performance data. The full activity history is compressed into a fixed 90-second piece, so musical form comes from density, timing, and contrast rather than from a traditional score.

## Time Design
The most important structural move happens before any sound is made. In [src/data/loader.js](/Users/aarogyarijal/Codes/MUSCI/src/data/loader.js), `clipToDenseWindow()` keeps the densest recent 70% of events and drops sparse early history. In [src/audio/transport.js](/Users/aarogyarijal/Codes/MUSCI/src/audio/transport.js), every retained timestamp is mapped onto the same 90-second transport. This means the composition preserves event order and relative spacing, but translates large spans of real time into a concentrated listening window.

## Harmonic Language
The project is centered on D dorian, defined in [src/audio/scales.js](/Users/aarogyarijal/Codes/MUSCI/src/audio/scales.js). D dorian keeps the piece minor enough to feel reflective, but its raised sixth gives it more brightness and motion than natural minor. Numeric activity values are normalized and quantized into scale tones with `valueToNote()` and `mapToNotes()`, which keeps the data expressive without letting the output collapse into random chromatic noise.

## Layer-to-Music Mapping
- `commits.js`: Commit churn becomes pitch, dominant file extension becomes stereo pan, and total lines changed becomes velocity. The voice is an FM synth, so frequent code activity reads as a bright arpeggiated surface.
- `contributors.js`: The top six repos or contributors are each assigned a stable chord tone. Weekly activity retriggers those notes, creating harmonic continuity across the piece.
- `pulls.js`: Pull requests become long drones. Their onset is the PR creation time, their duration tracks open-to-merge time, and review state adjusts filter brightness.
- `runs.js`: CI runs become percussion. Successes trigger a kick; failures trigger a heavier kick plus noise. A rolling failure rate also closes the master low-pass filter, darkening the whole mix.
- `pad.js`: A four-chord ambient bed sustains the form and prevents silence.
- `pulse.js`: An always-on eighth-note metallic tick provides rhythmic continuity in quiet sections.

## Dynamics and Form
In [src/main.js](/Users/aarogyarijal/Codes/MUSCI/src/main.js), `buildDensityProfile()` combines events from all layers into a normalized activity curve. That density profile is then used by the pad and pulse layers to swell in louder sections and soften in quieter ones. As a result, the music is not just a literal sequence of data points; it also breathes according to aggregate development intensity.

## Why It Works Musically
The project balances data fidelity with listenability. Density caps prevent extreme event bursts from becoming cluttered, quantization keeps pitches coherent, and the mixer glues the layers into one space with compression, EQ, reverb, and limiting. The result is less like a spreadsheet with speakers and more like a composed interpretation of software labor.
