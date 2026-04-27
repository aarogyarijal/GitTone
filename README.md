# MUSCI

Your git history, played as music.

Extracts commit, PR, CI, and contributor data from GitHub and sonifies it into a 90-second piece using Tone.js. Each layer of your development activity becomes a layer of sound.

## Data → Sound

| Layer | Data source | Sound |
|---|---|---|
| **Commits** | `gh search commits --author @me` | FM synth arpeggio. Pitch = lines changed (log-scaled, D dorian). Pan = file type. Velocity = churn size. |
| **Contributors** | Top 6 repos by commit count | One sustained synth voice per repo, fixed chord tone in D dorian. Triggers each week you had commits there. |
| **Pull Requests** | `gh search prs --author @me --merged` | Slow drone chords. Onset = PR opened, duration = time until merged. |
| **CI Runs** | `gh run list` across top 10 repos | Kick drum on every run. Failures get a louder kick + noise burst. High failure rate darkens the master filter. |
| **Pad** | Derived density profile | Always-on ambient chord bed (Dm7 → G7 → Cmaj7 → Am7). Swells with activity density. |
| **Pulse** | Derived density profile | Always-on 8th-note hi-hat tick. Holds the rhythm through quiet periods. |

Only your most active recent period is used — the app auto-detects the densest 70% of your history so playback starts in action, not in years of sparse early commits.

## Setup

```bash
npm install
bash scripts/extract.sh @me   # pulls your data from gh + git
npm run dev
```

Requires `gh` CLI authenticated (`gh auth login`) and `jq`, `python3`.

Open the page, hit **PLAY**. Use the layer toggles to solo/mute individual instruments. Speed slider adjusts transport BPM.
