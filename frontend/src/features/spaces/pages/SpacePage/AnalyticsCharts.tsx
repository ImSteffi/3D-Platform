import type { AnalyticsCount } from '../../../tours/api/tourRequests'

/** A list of labels with bars, largest first. */
export function Bars({ title, rows, name = (label: string) => label }: { title: string; rows: AnalyticsCount[]; name?: (label: string) => string }) {
 const top = Math.max(1, ...rows.map(row => row.views))
 return <section className="analytics-box">
  <h3>{title}</h3>
  {rows.length === 0 ? <p className="analytics-quiet">No data yet.</p> : <ul className="analytics-bars">
   {rows.map(row => <li key={row.label}>
    <span className="analytics-bar-label" title={name(row.label)}>{name(row.label)}</span>
    <span className="analytics-bar"><span style={{ width: `${row.views / top * 100}%` }} /></span>
    <span className="num">{row.views}</span>
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
