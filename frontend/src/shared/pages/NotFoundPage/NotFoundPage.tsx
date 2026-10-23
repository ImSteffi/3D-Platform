import { Link } from 'react-router'
import './NotFoundPage.css'
export default function NotFoundPage() {
 return <main className="not-found"><span className="eyebrow">404 / A little off the map</span><h1>This space doesn’t exist.</h1><p>The page may have moved, or the address might be incorrect.</p><Link className="btn btn-primary" to="/dashboard">Back to overview →</Link></main>
}
