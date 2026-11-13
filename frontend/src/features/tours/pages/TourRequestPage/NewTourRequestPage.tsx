import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import Icon from '../../../../shared/ui/Icon/Icon'
import { createTourRequest } from '../../api/tourRequests'
import '../GenerateTourPage/GeneratePage.css'
import './TourRequests.css'

export default function NewTourRequestPage() {
 const navigate = useNavigate()
 const [name, setName] = useState('')
 const [notes, setNotes] = useState('')
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (busy || !name.trim()) return
  setBusy(true); setError('')
  try {
   const tour = await createTourRequest(name.trim(), notes.trim())
   navigate('/generate/tour/' + tour.id, { replace: true })
  } catch (reason) {
   setError(reason instanceof Error ? reason.message : 'Could not create the tour. Please try again.')
   setBusy(false)
  }
 }
 return <main className="dashboard tr-page">
  <header className="generate-detail-heading">
   <Link to="/generate" className="generate-back" aria-label="Back to Generate"><Icon name="arrow" size={24} /></Link>
   <h1>New tour</h1>
  </header>
  <form className="tr-new" onSubmit={submit}>
   <p className="tr-lede">Name the property first. Next you will add a floor plan for every floor, building or outdoor area you want in the tour.</p>
   <label className="tr-field">Tour name
    <input required autoFocus value={name} maxLength={100} placeholder="e.g. Viieaia tee 28" onChange={event => setName(event.target.value)} />
   </label>
   <label className="tr-field">Notes (optional)
    <textarea value={notes} maxLength={2000} rows={4} placeholder="Anything we should know about the property" onChange={event => setNotes(event.target.value)} />
   </label>
   {error && <p className="tr-error" role="alert">{error}</p>}
   <div className="tr-footer"><button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Continue to floor plans'}</button></div>
  </form>
 </main>
}
