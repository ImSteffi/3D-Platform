import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useShellMode } from '../../shared/layout/Backdrop'
import { InlineError, Panel, Spinner } from '../../shared/ui'
import { getAdminAnalytics, type AdminAnalytics, type AdminCount } from '../tours/api/tourRequests'
import { Bars, Columns } from '../spaces/pages/SpacePage/AnalyticsCharts'
import { duration } from '../spaces/pages/SpacePage/analyticsFormat'
import '../spaces/pages/SpacePage/SpaceSections.css'
import './adminAnalytics.css'

const deviceNames: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer', headset: 'VR headset', unknown: 'Unknown' }
const rows = (counts: AdminCount[]) => counts.map(count => ({ label: count.label, views: count.count }))

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

 const t = data?.totals
 const dayLabels = data?.days.map(day => new Date(day.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) ?? []

 return <main className="page admin-analytics">
  <header className="page-header">
   <div><h1 className="desk-title">Analytics</h1></div>
  </header>
  <InlineError>{error}</InlineError>
  {!data && !error && <Spinner block label="Loading the analytics" />}
  {data && t && <>
   <Panel as="section" className="analytics" aria-labelledby="aa-business">
    <h2 id="aa-business">Customers and spaces</h2>
    <dl className="analytics-grid">
     <Card label="Customers" value={t.customers} hint={`${t.organizations} organizations`} />
     <Card label="Spaces" value={t.spaces} hint={`${t.floors} floors`} />
    </dl>
    <div className="analytics-pair">
     <Columns title="New spaces, last 30 days" values={data.days.map(day => day.spaces)} labels={dayLabels} every={7} />
     <Columns title="Photos uploaded to floors, last 30 days" values={data.days.map(day => day.photos)} labels={dayLabels} every={7} />
    </div>
   </Panel>

   <Panel as="section" className="analytics" aria-labelledby="aa-views">
    <h2 id="aa-views">Tour views</h2>
    <dl className="analytics-grid">
     <Card label="Views" value={t.views} hint="Across all spaces" />
     <Card label="Visitors" value={t.visitors} hint="Different people per day" />
     <Card label="Average time" value={duration(t.averageSeconds)} hint="Time spent in a tour" />
     <Card label="Embeds" value={t.embeds} hint="Views on other sites through the iframe" />
    </dl>
    <Columns title="Views in the last 30 days" values={data.days.map(day => day.views)} labels={dayLabels} every={7} />
    <section className="analytics-box">
     <h3>Most viewed spaces</h3>
     {data.topSpaces.length === 0 ? <p className="analytics-quiet">No views yet.</p> : <ul className="aa-list">
      {data.topSpaces.map(space => <li key={space.id}>
       <Link to={`/review/${space.id}`}>{space.name}</Link>
       <span className="aa-muted">{space.customer} · {duration(space.averageSeconds)} on average</span>
       <span className="num">{space.views}</span>
      </li>)}
     </ul>}
    </section>
    <div className="analytics-trio">
     <Bars title="Where views come from" rows={rows(data.sources)} />
     <Bars title="Devices" rows={rows(data.devices)} name={label => deviceNames[label] ?? label} />
     <Bars title="Regions (time zone)" rows={rows(data.regions)} />
    </div>
   </Panel>

  </>}
 </main>
}

function Card({ label, value, hint }: { label: string; value: number | string; hint: string }) {
 return <div className="analytics-card">
  <dt>{label}</dt>
  <dd className="num">{value}</dd>
  <p>{hint}</p>
 </div>
}
