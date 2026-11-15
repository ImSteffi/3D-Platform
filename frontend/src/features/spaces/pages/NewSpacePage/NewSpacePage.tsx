import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Field, InlineError, Panel } from '../../../../shared/ui'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { createTourRequest } from '../../../tours/api/tourRequests'
import './NewSpacePage.css'

const NAME_MAX = 100
const NOTES_MAX = 2000

const whatNext = [
 { who: 'You', text: 'Add a floor plan for each area: upload one or sketch it.' },
 { who: 'The team', text: 'Marks where to stand and which way to face for every photo.' },
 { who: 'You', text: 'Take the photos. The team then builds your tour in a few days.' },
]

export default function NewSpacePage() {
 useShellMode('place')
 const navigate = useNavigate()
 const [name, setName] = useState('')
 const [notes, setNotes] = useState('')
 const [nameError, setNameError] = useState<string | null>(null)
 const [error, setError] = useState<string | null>(null)
 const [saving, setSaving] = useState(false)

 async function submit(event: FormEvent) {
  event.preventDefault()
  if (saving) return
  const trimmed = name.trim()
  if (!trimmed) {
   setNameError('Give the space a name so you and the team can tell it apart.')
   return
  }
  setNameError(null)
  setError(null)
  setSaving(true)
  try {
   const created = await createTourRequest(trimmed, notes.trim())
   navigate(`/spaces/${created.id}/plan`)
  } catch (cause) {
   setError(cause instanceof Error ? cause.message : 'Could not start the space.')
   setSaving(false)
  }
 }

 return <main className="page newspace-page">
  <header className="page-header"><div><h1>Start a space</h1><p>Tell us about the place you want a tour of.</p></div></header>
  <Panel padding="lg" className="newspace-panel">
   <form className="newspace-form" onSubmit={submit} noValidate>
    <Field label="What should we call this space?" name="name" value={name} required maxLength={NAME_MAX}
     onChange={value => { setName(value); if (nameError) setNameError(null) }}
     placeholder="Harbour Street apartment" autoComplete="off" disabled={saving} error={nameError}
     hint="A name you will recognise, like the address or what the place is." />
    <Field as="textarea" label="Anything the team should know?" optional name="notes" value={notes} maxLength={NOTES_MAX} rows={4}
     onChange={setNotes} disabled={saving}
     placeholder="Rooms to leave out, how to get in, a date you need it by"
     hint={notes.length > NOTES_MAX - 200 ? <span className="num">{notes.length} / {NOTES_MAX}</span> : undefined} />
    <InlineError>{error && `${error} Nothing was saved. Check your connection and try again.`}</InlineError>
    <div className="newspace-actions">
     <Button type="submit" size="lg" loading={saving} iconAfter="arrow">{saving ? 'Starting your space' : 'Start this space'}</Button>
     <Button to="/spaces" size="lg" variant="quiet" disabled={saving}>Cancel</Button>
    </div>
   </form>
   <div className="newspace-next">
    <h2>What happens next</h2>
    <ol>
     {whatNext.map((step, index) => <li key={step.text}>
      <span className="newspace-next-n num" aria-hidden="true">{index + 1}</span>
      <p><b>{step.who}.</b> {step.text}</p>
     </li>)}
    </ol>
   </div>
  </Panel>
 </main>
}
