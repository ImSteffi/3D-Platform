import { Panel } from '../../../../shared/ui'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { TutorialRules, TutorialVideo } from '../../components/PhotoTutorial/PhotoTutorial'
import './LearnPage.css'

/** Route: /learn. One panel: the rules over the plan on the left, the same shown in a video on the right. */
export default function LearnPage() {
 useShellMode('place')
 return <main className="page learn-page">
  <header className="page-header"><div>
   <h1>How to take the photos</h1>
   <p>All you need is your phone.</p>
  </div></header>

  <Panel as="section" className="learn-lesson" padding="lg" aria-label="How to take the photos">
   <TutorialRules />
   <TutorialVideo />
  </Panel>
 </main>
}
