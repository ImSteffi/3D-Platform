import { useEffect, useState } from 'react'
import { Icon, InlineError, Panel, Spinner } from '../../../../shared/ui'
import { analyticsCsvUrl, getTourAnalytics, type AnalyticsTotals, type TourAnalytics as Stats, type TourDetail } from '../../../tours/api/tourRequests'
import { Bars, Delta, Sparkline } from './AnalyticsCharts'
import { duration } from './analyticsFormat'

const deviceNames: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer', headset: 'VR headset', unknown: 'Unknown' }

type Key = 'views' | 'visitors' | 'averageSeconds' | 'embeds'
const metrics: { key: Key; label: string; hint: string }[] = [
 { key: 'views', label: 'Views', hint: 'Times a tour was opened' },
 { key: 'visitors', label: 'Visitors', hint: 'Different people per day' },
 { key: 'averageSeconds', label: 'Average time', hint: 'Time spent in the tour' },
 { key: 'embeds', label: 'Embeds', hint: 'Views through the iframe on other sites' },
]

/** Viewing stats of this space's tours. Views inside the platform itself are not counted. */
export default function TourAnalytics({ tour }: { tour: TourDetail }) {
 const [stats, setStats] = useState<Stats | null>(null)
 const [error, setError] = useState('')

 useEffect(() => {
  let live = true
  getTourAnalytics(tour.id).then(next => { if (live) setStats(next) }).catch(() => { if (live) setError('Could not load the analytics. Try again.') })
  return () => { live = false }
 }, [tour.id])

 const show = (key: Key, totals: AnalyticsTotals) => key === 'averageSeconds' ? duration(totals.averageSeconds) : totals[key].toLocaleString()
 const series = (key: Key) => stats?.days.map(day => day[key]) ?? []

 return <Panel as="section" className="analytics analytics--rich" aria-label="Analytics">
  <header className="analytics-head">
   <div>
    <h2>Analytics</h2>
    <p>Last 30 days, compared with the 30 days before</p>
   </div>
   {stats && stats.totals.views > 0 && <a className="btn btn-secondary analytics-csv" href={analyticsCsvUrl(tour.id)} download><Icon name="download" size={16} /> Download CSV</a>}
  </header>
  <InlineError>{error}</InlineError>
  {!stats && !error && <Spinner block label="Loading the analytics" />}
  {stats && <>
   <div className="analytics-overview">
    <dl className="analytics-kpis">
     {metrics.map(m => <div key={m.key} className="analytics-kpi">
      <dt className="analytics-kpi-label">{m.label}</dt>
      <dd className="analytics-kpi-row">
       <span className="num analytics-kpi-value">{show(m.key, stats.recent)}</span>
       <Delta now={stats.recent[m.key]} before={stats.previous[m.key]} />
      </dd>
      <dd><Sparkline values={series(m.key)} /></dd>
      <dd className="analytics-kpi-hint">{m.hint} · all time {show(m.key, stats.totals)}</dd>
     </div>)}
    </dl>
   </div>
   {stats.totals.views === 0 && <p className="analytics-quiet">No views yet. Share the tour&rsquo;s URL or IFRAME and the numbers appear here.</p>}
   <div className="analytics-trio">
    <Bars title="Where views come from" rows={stats.sources} />
    <Bars title="Devices" rows={stats.devices} name={label => deviceNames[label] ?? label} />
    <Bars title="Regions (time zone)" rows={stats.regions} />
   </div>
  </>}
 </Panel>
}
