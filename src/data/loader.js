// Load pre-extracted JSON snapshots from /data/

export async function loadAll() {
  const load = async (name) => {
    try {
      const r = await fetch(`/data/${name}.json`)
      if (!r.ok) return null
      return r.json()
    } catch { return null }
  }

  const [commits, contributors, pulls, runs, meta] = await Promise.all([
    load('commits'),
    load('contributors'),
    load('pulls'),
    load('runs'),
    load('meta'),
  ])

  return { commits: commits ?? [], contributors: contributors ?? [], pulls: pulls ?? [], runs: runs ?? [], meta: meta ?? {} }
}

// Auto-detect the dense end-period of activity by finding the timestamp at the
// (1 - keepFraction) percentile of all event times. Skips sparse early years
// when the user has accelerated recently.
function findDenseStart(data, keepFraction = 0.7) {
  const ts = []
  for (const c of data.commits)      ts.push(c.timestamp * 1000)
  for (const c of data.contributors) for (const w of c.weeks) if (w.c > 0) ts.push(w.w * 1000)
  for (const p of data.pulls)        ts.push(new Date(p.createdAt).getTime())
  for (const r of data.runs)         ts.push(new Date(r.createdAt).getTime())

  if (!ts.length) return 0
  ts.sort((a, b) => a - b)
  const idx = Math.floor(ts.length * (1 - keepFraction))
  return ts[idx]
}

// Filter all event arrays to those at or after the dense-window start.
// Returns a new data object plus the {start, end} of the clipped window.
export function clipToDenseWindow(data, keepFraction = 0.7) {
  const start = findDenseStart(data, keepFraction)
  const after = (ms) => ms >= start

  const commits      = data.commits.filter(c => after(c.timestamp * 1000))
  const pulls        = data.pulls  .filter(p => after(new Date(p.createdAt).getTime()))
  const runs         = data.runs   .filter(r => after(new Date(r.createdAt).getTime()))
  const contributors = data.contributors
    .map(c => ({ ...c, weeks: c.weeks.filter(w => w.c > 0 && after(w.w * 1000)) }))
    .filter(c => c.weeks.length > 0)

  // End is the latest timestamp across the clipped data
  const allTs = []
  for (const c of commits)      allTs.push(c.timestamp * 1000)
  for (const c of contributors) for (const w of c.weeks) allTs.push(w.w * 1000)
  for (const p of pulls)        { allTs.push(new Date(p.createdAt).getTime()); if (p.mergedAt) allTs.push(new Date(p.mergedAt).getTime()) }
  for (const r of runs)         allTs.push(new Date(r.createdAt).getTime())

  const end = allTs.length ? Math.max(...allTs) : Date.now()

  return {
    data: { commits, contributors, pulls, runs, meta: data.meta },
    start,
    end,
  }
}

export function getDateRange(data) {
  const ts = []
  for (const c of data.commits)      ts.push(c.timestamp * 1000)
  for (const c of data.contributors) for (const w of c.weeks) if (w.c > 0) ts.push(w.w * 1000)
  for (const p of data.pulls)        { ts.push(new Date(p.createdAt).getTime()); if (p.mergedAt) ts.push(new Date(p.mergedAt).getTime()) }
  for (const r of data.runs)         ts.push(new Date(r.createdAt).getTime())

  if (!ts.length) return { start: Date.now() - 86400000, end: Date.now() }
  return { start: Math.min(...ts), end: Math.max(...ts) }
}
