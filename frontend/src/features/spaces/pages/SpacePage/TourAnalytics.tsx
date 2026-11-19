import { useEffect, useState } from 'react'
import { Icon, InlineError, Panel, Spinner } from '../../../../shared/ui'
import { analyticsCsvUrl, getTourAnalytics, type AnalyticsCount, type TourAnalytics as Stats, type TourDetail } from '../../../tours/api/tourRequests'

const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const deviceNames: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer', headset: 'VR headset', unknown: 'Unknown' }

function duration(seconds: number) {
 if (seconds < 60) return `${seconds} s`
 return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

/** A list of labels with bars, largest first. */
function Bars({ title, rows, name = (label: string) => label }: { title: string; rows: AnalyticsCount[]; name?: (label: string) => string }) {
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
function Columns({ title, values, labels, every = 1 }: { title: string; values: number[]; labels: string[]; every?: number }) {
 const top = Math.max(1, ...values)
 return <section className="analytics-box">
  <h3>{title}</h3>
  <div className="analytics-columns" role="img" aria-label={`${title}: ${values.map((value, index) => `${labels[index]} ${value}`).join(', ')}`}>
   {values.map((value, index) => <div key={index} className="analytics-column" title={`${labels[index]}: ${value}`}>
    <span style={{ height: `${value / top * 100}%` }} />
    <small>{index % every === 0 ? labels[index] : ''}</small>
   </div>)}
  </div>
 </section>
}

/** Viewing stats of this space's tours. Views inside the platform itself are not counted. */
export default function TourAnalytics({ tour }: { tour: TourDetail }) {
 const [stats, setStats] = useState<Stats | null>(null)
 const [error, setError] = useState('')

 useEffect(() => {
  let live = true
  getTourAnalytics(tour.id).then(next => { if (live) setStats(next) }).catch(() => { if (live) setError('Could not load the analytics. Try again.') })
  return () => { live = false }
 }, [tour.id])

 const t = stats?.totals
 const metrics = t ? [
  { label: 'Views', value: t.views, hint: 'Times a tour was opened' },
  { label: 'Visitors', value: t.visitors, hint: 'Different people per day' },
  { label: 'Average time', value: duration(t.averageSeconds), hint: 'Time spent in the tour' },
  { label: 'Embeds', value: t.embeds, hint: 'Views on other sites through the iframe' },
 ] : []

 return <Panel as="section" className="analytics" aria-label="Analytics">
  <header className="analytics-head">
   <div>
    <h2>Analytics</h2>
   </div>
   {t && t.views > 0 && <a className="btn btn-secondary analytics-csv" href={analyticsCsvUrl(tour.id)} download><Icon name="download" size={16} /> Download CSV</a>}
  </header>
  <InlineError>{error}</InlineError>
  {!stats && !error && <Spinner block label="Loading the analytics" />}
  {stats && <>
   <dl className="analytics-grid">
    {metrics.map(metric => <div key={metric.label} className="analytics-card">
     <dt>{metric.label}</dt>
     <dd className="num">{metric.value}</dd>
     <p>{metric.hint}</p>
    </div>)}
   </dl>
   {t?.views === 0 && <p className="analytics-quiet">No views yet. Share the tour&rsquo;s URL or IFRAME and the numbers appear here.</p>}
   <Columns title="Views in the last 30 days" values={stats.days.map(day => day.views)}
    labels={stats.days.map(day => new Date(day.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))} every={7} />
   <Bars title="Where views come from" rows={stats.sources} />
   <div className="analytics-pair">
    <Columns title="Time of day" values={stats.hours} labels={stats.hours.map((_, hour) => `${hour}:00`)} every={6} />
    <Columns title="Day of the week" values={stats.weekdays} labels={weekdayNames} />
   </div>
   <div className="analytics-trio">
    <Bars title="Devices" rows={stats.devices} name={label => deviceNames[label] ?? label} />
    <Bars title="Regions (time zone)" rows={stats.regions} />
   </div>
  </>}
 </Panel>
}
