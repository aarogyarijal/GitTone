# File Architecture

## Top-Level Flow
The application has a simple pipeline:

1. `scripts/extract.sh` gathers Git and GitHub data into `data/*.json`.
2. `src/data/loader.js` fetches those JSON snapshots in the browser.
3. `src/main.js` clips the dataset to a dense recent window, initializes the transport, and boots the visualization and audio layers.
4. `src/layers/*.js` turn each data stream into scheduled Tone.js events.
5. `src/viz/timeline.js` renders the visual timeline and animated playhead.

## What Each File Does

### App shell
- [index.html](/Users/aarogyarijal/Codes/MUSCI/index.html): Defines the UI shell, including the title, repo label, SVG timeline, play button, timer, speed slider, and legend. It also contains the project styling and loads `src/main.js`.
- [package.json](/Users/aarogyarijal/Codes/MUSCI/package.json): Declares the Vite dev/build scripts and the two runtime dependencies, `tone` and `d3`.
- [vite.config.js](/Users/aarogyarijal/Codes/MUSCI/vite.config.js): Minimal Vite configuration for the local dev server and build output.

### Data extraction and loading
- [scripts/extract.sh](/Users/aarogyarijal/Codes/MUSCI/scripts/extract.sh): Pulls raw commit, PR, contributor, run, and metadata from GitHub CLI and local git, then writes normalized JSON files into `data/`.
- [data/commits.json](/Users/aarogyarijal/Codes/MUSCI/data/commits.json): Commit-level event source.
- [data/contributors.json](/Users/aarogyarijal/Codes/MUSCI/data/contributors.json): Weekly grouped contributor or repo activity used for polyphony.
- [data/pulls.json](/Users/aarogyarijal/Codes/MUSCI/data/pulls.json): Pull request timing and review-state data.
- [data/runs.json](/Users/aarogyarijal/Codes/MUSCI/data/runs.json): CI runs used for percussion and stress.
- [data/meta.json](/Users/aarogyarijal/Codes/MUSCI/data/meta.json): Repo or user label shown in the interface.
- [src/data/loader.js](/Users/aarogyarijal/Codes/MUSCI/src/data/loader.js): Loads the JSON files, finds the dense activity window, clips the dataset, and exposes the resulting time range.

### Audio infrastructure
- [src/audio/transport.js](/Users/aarogyarijal/Codes/MUSCI/src/audio/transport.js): Stores the global time mapping from real timestamps to transport seconds.
- [src/audio/scales.js](/Users/aarogyarijal/Codes/MUSCI/src/audio/scales.js): Holds musical scales, note conversion helpers, and numeric-to-pitch mapping functions.
- [src/audio/voices.js](/Users/aarogyarijal/Codes/MUSCI/src/audio/voices.js): Defines the synth and drum factories for each layer.
- [src/audio/mixer.js](/Users/aarogyarijal/Codes/MUSCI/src/audio/mixer.js): Builds the master bus with compression, EQ, reverb, limiting, and a stress-responsive low-pass filter.

### Musical layers
- [src/layers/commits.js](/Users/aarogyarijal/Codes/MUSCI/src/layers/commits.js): Schedules commit notes from churn, file type, and timing.
- [src/layers/contributors.js](/Users/aarogyarijal/Codes/MUSCI/src/layers/contributors.js): Creates one sustained voice per top contributor or repo and retriggers it from weekly activity.
- [src/layers/pulls.js](/Users/aarogyarijal/Codes/MUSCI/src/layers/pulls.js): Converts pull requests into filtered drones whose durations reflect merge time.
- [src/layers/runs.js](/Users/aarogyarijal/Codes/MUSCI/src/layers/runs.js): Converts CI runs into percussion and updates overall mix darkness from failure rate.
- [src/layers/pad.js](/Users/aarogyarijal/Codes/MUSCI/src/layers/pad.js): Runs the long ambient chord bed.
- [src/layers/pulse.js](/Users/aarogyarijal/Codes/MUSCI/src/layers/pulse.js): Runs the steady eighth-note pulse.

### Visualization
- [src/viz/timeline.js](/Users/aarogyarijal/Codes/MUSCI/src/viz/timeline.js): Draws commit dots, PR bars, run markers, year labels, and the moving playhead with D3.

## How It Works Together
`src/main.js` is the coordinator. It loads the extracted data, clips it to the most active period, calls `initTransport()` so every module shares the same time mapping, and computes a density profile from all event types. That density profile is passed into the pad and pulse layers so the background texture responds to overall activity rather than to just one dataset.

Once the user presses play, `main.js` starts Tone.js, creates the master mixer, initializes every layer, and starts the transport. Each layer independently schedules events against the shared transport, so the system stays modular: commits can change without affecting PR scheduling, and the timeline visualization can track playback without generating sound itself.

The result is a clean separation of concerns: extraction produces normalized data, loader trims it, transport standardizes time, layers create sound, mixer shapes the total output, and the timeline makes the transformation visible.
