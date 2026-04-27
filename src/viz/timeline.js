import * as d3 from 'd3'
import * as Tone from 'tone'
import { getAudioDuration, getDataStart, getDataEnd } from '../audio/transport.js'

const COLORS = {
  commits:      '#7c6af7',
  contributors: '#4fcfb4',
  pulls:        '#f7c26a',
  runs:         '#f76a6a',
}

const H = 120
let svg, playhead, xScale, raf

export function initTimeline(container, data) {
  const svgEl = container.querySelector('#timeline-svg')
  const width  = container.clientWidth || 900

  svg = d3.select(svgEl)
    .attr('width', width)
    .attr('height', H)

  const start = getDataStart()
  const end   = getDataEnd()

  xScale = d3.scaleLinear().domain([start, end]).range([20, width - 20])

  // Commit dots
  const commitG = svg.append('g')
  commitG.selectAll('circle')
    .data(data.commits)
    .join('circle')
      .attr('cx',  c => xScale(c.timestamp * 1000))
      .attr('cy',  H * 0.35)
      .attr('r',   c => Math.min(5, 1.5 + Math.log1p(c.linesAdded + c.linesDeleted) * 0.5))
      .attr('fill', COLORS.commits)
      .attr('opacity', 0.55)

  // PR bars (createdAt → mergedAt)
  const pullsWithMerge = data.pulls.filter(p => p.mergedAt)
  svg.append('g')
    .selectAll('line')
    .data(pullsWithMerge)
    .join('line')
      .attr('x1', p => xScale(new Date(p.createdAt).getTime()))
      .attr('x2', p => xScale(new Date(p.mergedAt).getTime()))
      .attr('y1', H * 0.6)
      .attr('y2', H * 0.6)
      .attr('stroke', COLORS.pulls)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.5)

  // CI run dots
  svg.append('g')
    .selectAll('circle')
    .data(data.runs)
    .join('circle')
      .attr('cx',   r => xScale(new Date(r.createdAt).getTime()))
      .attr('cy',   H * 0.8)
      .attr('r',    2.5)
      .attr('fill', r => r.conclusion === 'success' ? COLORS.runs : '#fff')
      .attr('opacity', 0.6)

  // x-axis ticks (years)
  const years = d3.timeYears(new Date(start), new Date(end))
  svg.append('g')
    .selectAll('text')
    .data(years)
    .join('text')
      .attr('x', d => xScale(d.getTime()))
      .attr('y', H - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#555')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .text(d => d.getFullYear())

  // Playhead
  playhead = svg.append('line')
    .attr('x1', 20).attr('x2', 20)
    .attr('y1', 0).attr('y2', H)
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.8)

  return { xScale }
}

export function startPlayhead() {
  const audioDur  = getAudioDuration()
  const dataStart = getDataStart()
  const dataEnd   = getDataEnd()

  function tick() {
    const t        = Tone.getTransport().seconds
    const fraction = t / audioDur
    const dataTs   = dataStart + fraction * (dataEnd - dataStart)
    if (xScale) {
      const x = xScale(dataTs)
      playhead?.attr('x1', x).attr('x2', x)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

export function stopPlayhead() {
  if (raf) cancelAnimationFrame(raf)
}
