# MUSCI

Your git history, played as music.

Extracts commit, PR, CI, and contributor data from GitHub and sonifies it into a 90-second piece using Tone.js. Each layer of your development activity becomes a layer of sound, all locked to a shared harmonic framework so the output feels composed rather than generated.

## Data → Sound

| Layer | Data source | Sound |
|---|---|---|
| **Commits** | `gh search commits` | FM synth melody. Chord tone chosen by churn size. Octave and timbre driven by dominant file extension. Burst clusters become ascending arpeggios. |
| **Contributors** | Top 6 by commit count | One synth voice per contributor, panned across the stereo field. Each is assigned a fixed chord tone and retriggers that single pitch on every active week, so simultaneous contributors stack into harmony. |
| **Pull Requests** | `gh search prs --merged` | Bell-like AMSynth chime at the moment of merge. PR size → how many chord tones ring (1–3). Review decision → octave and filter brightness. |
| **CI Runs** | `gh run list` across top 10 repos | Kick on success, heavier kick + noise burst on failure. High failure rate closes the master low-pass filter, darkening the whole mix. |
| **Pad** | Derived density profile | Always-on ambient chord bed (Dm7 → G7 → Cmaj7 → Am7) in drop-2 voicings with smooth voice leading. Swells with activity density. |
| **Pulse** | Derived density profile | Always-on 8th-note ostinato that arpeggiates the currently-sounding pad chord instead of repeating a fixed pitch. |

All event times are quantized to a beat grid (16th notes for commits and CI runs, quarter notes for PRs) before scheduling so activity density feels rhythmic rather than noisy. All melodic layers pick their pitches from the active pad chord so every note lands in harmony.

Only the densest recent 70% of your history is used — sparse early years are dropped automatically.

## Setup

```bash
npm install
bash scripts/extract.sh @me   # pulls your data from gh + git
npm run dev
```

Requires `gh` CLI authenticated (`gh auth login`) and `jq`, `python3`.

Open the page and hit **PLAY**. The visualization shows a live waveform and frequency spectrum of the master audio output. The speed slider adjusts transport BPM.
