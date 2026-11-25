import { useId } from 'react'
import type { AnalyticsCount } from '../../../tours/api/tourRequests'

/** A list of labels with bars and their share, largest first. */
export function Bars({ title, rows, name = (label: string) => label }: { title: string; rows: AnalyticsCount[]; name?: (label: string) => string }) {
 const top = Math.max(1, ...rows.map(row => row.views))
 const all = Math.max(1, rows.reduce((sum, row) => sum + row.views, 0))
 return <section className="analytics-box">
  <h3>{title}</h3>
  {rows.length === 0 ? <p className="analytics-quiet">No data yet.</p> : <ul className="analytics-bars">
   {rows.map(row => <li key={row.label}>
    <span className="analytics-bar-label" title={name(row.label)}>{name(row.label)}</span>
    <span className="num analytics-bar-value">{row.views}<small>{Math.round(row.views / all * 100)}%</small></span>
    <span className="analytics-bar"><span style={{ width: `${row.views / top * 100}%` }} /></span>
   </li>)}
  </ul>}
 </section>
}

/** Small vertical bars: one per day, hour or weekday. */
export function Columns({ title, values, labels, every = 1 }: { title: string; values: number[]; labels: string[]; every?: number }) {
 const top = Math.max(1, ...values)
 return <section className="analytics-box">
  <h3>{title}</h3>
  <div className="analytics-columns" role="img" aria-label={`${title}: ${values.map((value, index) => `${labels[index]} ${value}`).join(', ')}`}>
   {values.map((value, index) => <div key={index} className="analytics-column" title={`${labels[index]}: ${value}`}>
    <i className="analytics-column-track"><span style={{ height: `${value / top * 100}%` }} /></i>
    <small>{index % every === 0 ? labels[index] : ''}</small>
   </div>)}
  </div>
 </section>
}

/** A smooth line through the points (x, y in 0..100), without overshooting between them. */
function curve(points: [number, number][]) {
 return points.map(([x, y], i) => {
  if (i === 0) return `M${x} ${y}`
  const [px, py] = points[i - 1]
  const mid = (px + x) / 2
  return `C${mid} ${py} ${mid} ${y} ${x} ${y}`
 }).join(' ')
}

const toPoints = (values: number[], top: number, pad = 0): [number, number][] =>
 values.map((value, i) => [values.length > 1 ? i / (values.length - 1) * 100 : 50, 100 - pad - value / top * (100 - pad * 2)])

/** A tiny trend line for a number's card. */
export function Sparkline({ values }: { values: number[] }) {
 const id = useId()
 const top = Math.max(1, ...values)
 const points = toPoints(values, top, 6)
 const line = curve(points)
 return <svg className="analytics-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
  <path d={`${line} L100 100 L0 100 Z`} fill={`url(#${id})`} />
  <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
 </svg>
}

/** The last 30 days against the 30 before them. */
export function Delta({ now, before }: { now: number; before: number }) {
 if (now === 0 && before === 0) return <span className="analytics-delta">No change</span>
 if (before === 0) return <span className="analytics-delta is-up">New</span>
 const change = Math.round((now - before) / before * 100)
 if (change === 0) return <span className="analytics-delta">No change</span>
 return <span className={`analytics-delta ${change > 0 ? 'is-up' : 'is-down'}`}>
  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" style={change < 0 ? { transform: 'rotate(180deg)' } : undefined}>
   <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
  <span className="visually-hidden">{change > 0 ? 'up' : 'down'} </span>{Math.abs(change)}%
 </span>
}
