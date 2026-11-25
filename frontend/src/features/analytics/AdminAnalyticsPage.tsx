import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useShellMode } from '../../shared/layout/Backdrop'
import { InlineError, Panel, Spinner } from '../../shared/ui'
import { getAdminAnalytics, type AdminAnalytics, type AdminCount, type AdminPeriod } from '../tours/api/tourRequests'
import { Bars, Delta, Sparkline } from '../spaces/pages/SpacePage/AnalyticsCharts'
import { duration } from '../spaces/pages/SpacePage/analyticsFormat'
import '../spaces/pages/SpacePage/SpaceSections.css'
import './adminAnalytics.css'

const deviceNames: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer', headset: 'VR headset', unknown: 'Unknown' }
const rows = (counts: AdminCount[]) => counts.map(count => ({ label: count.label, views: count.count }))

type Kpi = {
 label: string
 /** The big number. */
 value: string
 /** The last 30 days against the 30 before them, when it has a period. */
 compare?: { now: number; before: number }
 /** Per day over the last 30 days. */
 trend?: number[]
 hint: string
}

/** One row of numbers in the space analytics' style: value, change, trend line, and a quiet hint. */
function Kpis({ items }: { items: Kpi[] }) {
 return <div className="analytics-overview">
  <dl className="analytics-kpis">
   {items.map(item => <div key={item.label} className="analytics-kpi">
    <dt className="analytics-kpi-label">{item.label}</dt>
    <dd className="analytics-kpi-row">
     <span className="num analytics-kpi-value">{item.value}</span>
     {item.compare && <Delta now={item.compare.now} before={item.compare.before} />}
    </dd>
    <dd>{item.trend ? <Sparkline values={item.trend} /> : <span className="aa-spark-gap" aria-hidden="true" />}</dd>
    <dd className="analytics-kpi-hint">{item.hint}</dd>
   </div>)}
  </dl>
 </div>
}

/** Route: /analytics. The team's overview of the whole platform. */
export default function AdminAnalyticsPage() {
 useShellMode('desk')
 const [data, setData] = useState<AdminAnalytics | null>(null)
 const [error, setError] = useState('')

 useEffect(() => {
  let live = true
  getAdminAnalytics().then(next => { if (live) setData(next) }).catch(() => { if (live) setError('Could not load the analytics. Try again.') })
  return () => { live = false }
 }, [])

 const n = (value: number) => value.toLocaleString()
 const compare = (key: keyof AdminPeriod) => data ? { now: data.recent[key], before: data.previous[key] } : undefined
 const trend = (key: keyof AdminPeriod) => data?.days.map(day => day[key]) ?? []
 const t = data?.totals
 const top = data?.topSpaces ?? []
 const most = Math.max(1, ...top.map(space => space.views))

 return <main className="page admin-analytics">
  <header className="page-header aa-head">
   <div>
    <h1 className="desk-title">Analytics</h1>
    <p>Last 30 days, compared with the 30 days before</p>
   </div>
  </header>
  <InlineError>{error}</InlineError>
  {!data && !error && <Spinner block label="Loading the analytics" />}
  {data && t && <>
   <Panel as="section" className="analytics analytics--rich" aria-labelledby="aa-views">
    <h2 id="aa-views">Tour views</h2>
    <Kpis items={[
     { label: 'Views', value: n(data.recent.views), compare: compare('views'), trend: trend('views'), hint: `Across all spaces · all time ${n(t.views)}` },
     { label: 'Visitors', value: n(data.recent.visitors), compare: compare('visitors'), trend: trend('visitors'), hint: `Different people per day · all time ${n(t.visitors)}` },
     { label: 'Average time', value: duration(data.recent.averageSeconds), compare: compare('averageSeconds'), trend: trend('averageSeconds'), hint: `In a tour · all time ${duration(t.averageSeconds)}` },
     { label: 'Embeds', value: n(data.recent.embeds), compare: compare('embeds'), trend: trend('embeds'), hint: `Through the iframe · all time ${n(t.embeds)}` },
    ]} />
    {t.views === 0 && <p className="analytics-quiet">No views yet. Once customers share their tours, the numbers appear here.</p>}
    <div className="analytics-pair">
     <section className="analytics-box">
      <h3>Most viewed spaces</h3>
      {top.length === 0 ? <p className="analytics-quiet">No views yet.</p> : <ol className="aa-top">
       {top.map((space, index) => <li key={space.id}>
        <span className="aa-rank num">{index + 1}</span>
        <span className="aa-top-name">
         <Link to={`/review/${space.id}`}>{space.name}</Link>
         <small>{space.customer} · {duration(space.averageSeconds)} on average</small>
        </span>
        <span className="aa-top-views num">{n(space.views)}</span>
        <span className="analytics-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, space.views / most * 100)}%` }} /></span>
       </li>)}
      </ol>}
     </section>
     <Bars title="Where views come from" rows={rows(data.sources)} />
    </div>
    <div className="analytics-pair">
     <Bars title="Devices" rows={rows(data.devices)} name={label => deviceNames[label] ?? label} />
     <Bars title="Regions (time zone)" rows={rows(data.regions)} />
    </div>
   </Panel>

   <Panel as="section" className="analytics analytics--rich" aria-labelledby="aa-business">
    <h2 id="aa-business">Customers and spaces</h2>
    <Kpis items={[
     { label: 'Customers', value: n(t.customers), hint: `${n(t.organizations)} ${t.organizations === 1 ? 'organization' : 'organizations'}` },
     { label: 'New spaces', value: n(data.recent.spaces), compare: compare('spaces'), trend: trend('spaces'), hint: `All time ${n(t.spaces)}` },
     { label: 'Photos uploaded', value: n(data.recent.photos), compare: compare('photos'), trend: trend('photos'), hint: `All time ${n(data.photos)}` },
     { label: 'Floors', value: n(t.floors), hint: `In ${n(t.spaces)} ${t.spaces === 1 ? 'space' : 'spaces'}` },
    ]} />
   </Panel>
  </>}
 </main>
}
