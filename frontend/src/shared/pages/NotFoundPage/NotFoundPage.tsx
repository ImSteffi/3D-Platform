import { Button, Panel } from '../../ui'
import './NotFoundPage.css'
export default function NotFoundPage() {
 return <main className="not-found">
  <Panel as="div" padding="lg" className="not-found-panel">
   <h1>This page does not exist</h1>
   <p>The address may be wrong, or the page may have moved. Nothing of yours is lost.</p>
   <Button to="/" icon="back">Back to the start</Button>
  </Panel>
 </main>
}
