import type { ReactNode } from 'react'
import { Button, Icon, Panel } from '../../../../shared/ui'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import './LearnPage.css'

/** A straight line with an open arrow head at its end. */
function Arrow({ x1, y1, x2, y2, className = 'dg-ink' }: { x1: number; y1: number; x2: number; y2: number; className?: string }) {
 const angle = Math.atan2(y2 - y1, x2 - x1)
 const head = 7
 const wing = (turn: number) => `${(x2 - head * Math.cos(angle + turn)).toFixed(1)} ${(y2 - head * Math.sin(angle + turn)).toFixed(1)}`
 return <path className={className} d={`M${x1} ${y1}L${x2} ${y2}M${wing(.5)}L${x2} ${y2}L${wing(-.5)}`} />
}

/** A thin callout line that starts with a small dot on the thing it names. */
function Callout({ x1, y1, x2, y2, tone = '' }: { x1: number; y1: number; x2: number; y2: number; tone?: '' | 'red' }) {
 return <g className={tone === 'red' ? 'dg-call dg-call--red' : 'dg-call'}>
  <path d={`M${x1} ${y1}L${x2} ${y2}`} />
  <circle cx={x1} cy={y1} r="2.2" />
 </g>
}

/** A capture point as it is drawn on plans: ink disc = taken, amber = next, hollow = to do. */
function Point({ x, y, n, kind = 'taken' }: { x: number; y: number; n: number; kind?: 'taken' | 'next' | 'todo' }) {
 return <g>
  <circle cx={x} cy={y} r={kind === 'next' ? 13 : 11} className={`dg-point dg-point--${kind}`} />
  <text x={x} y={y + 4} className={`dg-num dg-num--${kind}`}>{n}</text>
 </g>
}

function StandDiagram() {
 return <svg className="dg" viewBox="0 0 400 260" role="img"
  aria-label="A floor plan with four numbered points. Each point has an arrow. The next point, number 3, is amber: stand on the number and face along its arrow.">
  <rect x="40" y="30" width="240" height="200" className="dg-floor" />
  <path className="dg-wall" d="M40 30h240v200H40zM170 30v72M170 134v96M170 140h34M236 140h44" />
  <Arrow x1={95} y1={90} x2={95} y2={116} />
  <Arrow x1={125} y1={185} x2={151} y2={185} />
  <Arrow x1={212} y1={82} x2={184} y2={82} />
  <Arrow x1={228} y1={174} x2={228} y2={152} className="dg-faint" />
  <Point x={95} y={75} n={1} />
  <Point x={110} y={185} n={2} />
  <Point x={228} y={82} n={3} kind="next" />
  <Point x={228} y={188} n={4} kind="todo" />
  <Callout x1={241} y1={82} x2={298} y2={82} />
  <text x="304" y="80" className="dg-label">Stand on</text>
  <text x="304" y="95" className="dg-label">the number</text>
  <Callout x1={198} y1={76} x2={198} y2={22} />
  <text x="198" y="15" className="dg-label" textAnchor="middle">Face along the arrow</text>
 </svg>
}

function HoldDiagram() {
 return <svg className="dg" viewBox="0 0 400 260" role="img"
  aria-label="A person seen from the side holding a phone upright in front of their chest. Callouts: chest height, upright, hold still for a second.">
  <path className="dg-faint" d="M90 236H300" />
  <circle cx="170" cy="48" r="16" className="dg-ink" />
  <rect x="156" y="70" width="28" height="84" rx="14" className="dg-ink" />
  <path className="dg-ink" d="M164 153L160 236h12M176 153l6 83h12" />
  <path className="dg-ink" d="M172 88l14 32 32-4" />
  <rect x="216" y="84" width="24" height="44" rx="5" className="dg-ink dg-fill-amber" />
  <circle cx="228" cy="92" r="2" className="dg-dot" />
  <path className="dg-faint dg-dash" d="M110 106H216" />
  <path className="dg-call" d="M110 106V236M104 106h12M104 236h12" />
  <text x="100" y="168" className="dg-label" textAnchor="end">Chest</text>
  <text x="100" y="183" className="dg-label" textAnchor="end">height</text>
  <Callout x1={240} y1={90} x2={292} y2={64} />
  <text x="298" y="68" className="dg-label">Upright</text>
  <Callout x1={240} y1={114} x2={292} y2={114} />
  <text x="298" y="112" className="dg-label">Hold still</text>
  <text x="298" y="127" className="dg-label">for a second</text>
 </svg>
}

function LightDiagram() {
 return <svg className="dg" viewBox="0 0 400 260" role="img"
  aria-label="A room with the ceiling light on and the curtains open. Callouts: lights on, curtains open, not straight into a bright window.">
  <rect x="40" y="44" width="240" height="150" className="dg-floor" />
  <path className="dg-wall" d="M40 44h240v150H40z" />
  <path className="dg-faint" d="M40 194L18 238M280 194l22 44" />
  <rect x="176" y="78" width="72" height="78" className="dg-ink dg-fill-amber" />
  <path className="dg-faint" d="M212 78v78M176 117h72" />
  <path className="dg-ink" d="M160 72h104" />
  <path className="dg-ink dg-fill-paper" d="M168 72h16c-5 30-5 60 0 90h-16zM240 72h16v90h-16c5-30 5-60 0-90z" />
  <path className="dg-ink" d="M104 44v22" />
  <path className="dg-ink dg-fill-amber-solid" d="M90 84l6-18h16l6 18z" />
  <path className="dg-amber-line" d="M92 94l-8 14M104 96v16M116 94l8 14" />
  <Callout x1={92} y1={70} x2={66} y2={30} />
  <text x="40" y="24" className="dg-label">Lights on</text>
  <Callout x1={256} y1={100} x2={300} y2={84} />
  <text x="306" y="82" className="dg-label">Curtains</text>
  <text x="306" y="97" className="dg-label">open</text>
  <Callout x1={236} y1={140} x2={300} y2={150} />
  <text x="306" y="148" className="dg-label">Not straight</text>
  <text x="306" y="163" className="dg-label">into a bright</text>
  <text x="306" y="178" className="dg-label">window</text>
 </svg>
}

function ClearDiagram() {
 return <svg className="dg" viewBox="0 0 400 220" role="img"
  aria-label="Three signs: no people or pets in the shot, nothing moving, and doors between rooms left open.">
  <circle cx="72" cy="96" r="46" className="dg-faint" />
  <circle cx="72" cy="84" r="10" className="dg-ink" />
  <path className="dg-ink" d="M52 118a20 20 0 0 1 40 0" />
  <path className="dg-ink" d="M39.500 128.500l65-65" />
  <text x="72" y="170" className="dg-label" textAnchor="middle">No people or pets</text>
  <text x="72" y="186" className="dg-sub" textAnchor="middle">step out of the shot</text>

  <circle cx="200" cy="96" r="46" className="dg-faint" />
  <circle cx="200" cy="96" r="4" className="dg-ink" />
  <ellipse cx="200" cy="78" rx="6" ry="14" className="dg-ink" />
  <ellipse cx="200" cy="78" rx="6" ry="14" className="dg-ink" transform="rotate(120 200 96)" />
  <ellipse cx="200" cy="78" rx="6" ry="14" className="dg-ink" transform="rotate(240 200 96)" />
  <path className="dg-ink" d="M167.500 128.500l65-65" />
  <text x="200" y="170" className="dg-label" textAnchor="middle">Nothing moving</text>
  <text x="200" y="186" className="dg-sub" textAnchor="middle">fans and screens off</text>

  <circle cx="328" cy="96" r="46" className="dg-amber-line" />
  <rect x="314" y="66" width="34" height="60" className="dg-ink dg-fill-paper" />
  <path className="dg-ink dg-fill-amber" d="M314 66l-16 8v60l16-8z" />
  <circle cx="302" cy="104" r="1.800" className="dg-dot" />
  <text x="328" y="170" className="dg-label" textAnchor="middle">Doors open</text>
  <text x="328" y="186" className="dg-sub" textAnchor="middle">between rooms</text>
 </svg>
}

function RetakeDiagram() {
 return <svg className="dg" viewBox="0 0 400 260" role="img"
  aria-label="A floor plan where point 4 has a red ring, which means retake. A line leads from it to the team's note: too dark, turn on the lights.">
  <rect x="30" y="56" width="190" height="170" className="dg-floor" />
  <path className="dg-wall" d="M30 56h190v170H30zM120 56v60M120 150v76" />
  <Point x={75} y={100} n={3} />
  <Point x={75} y={185} n={5} />
  <Point x={170} y={196} n={6} kind="todo" />
  <Point x={170} y={140} n={4} />
  <circle cx="170" cy="140" r="16" className="dg-red-ring" />
  <Callout x1={170} y1={122} x2={170} y2={40} />
  <text x="126" y="32" className="dg-label">Red ring means retake</text>
  <Callout x1={187} y1={140} x2={250} y2={140} tone="red" />
  <rect x="250" y="112" width="142" height="60" rx="12" className="dg-note" />
  <text x="262" y="137" className="dg-label">Too dark.</text>
  <text x="262" y="154" className="dg-sub">Turn on the lights.</text>
  <text x="250" y="102" className="dg-sub">The team's note</text>
 </svg>
}

function Lesson({ n, title, lead, points, figure }: { n: number; title: string; lead: string; points: string[]; figure: ReactNode }) {
 const id = `learn-lesson-${n}`
 return <Panel className="learn-lesson" padding="lg" aria-labelledby={id}>
  <div className="learn-figure">{figure}</div>
  <div className="learn-text">
   <span className="learn-n num" aria-hidden="true">{n}</span>
   <h2 id={id}>{title}</h2>
   <p className="learn-lead">{lead}</p>
   <ul>{points.map(point => <li key={point}>{point}</li>)}</ul>
  </div>
 </Panel>
}

const checklist = [
 'Lights on, curtains open',
 'Doors between rooms open',
 'Nobody in the shot, nothing moving',
 'Phone upright at chest height',
 'Stand on the number, face along the arrow',
 'Hold still for a second, then take the photo',
]

export default function LearnPage() {
 useShellMode('place')
 return <main className="page learn-page">
  <header className="page-header"><div>
   <h1>How to take good photos</h1>
   <p>Five short things to know before your first capture. No experience needed.</p>
  </div></header>

  <Lesson n={1} title="Where to stand" figure={<StandDiagram />}
   lead="Stand on the number, face along the arrow."
   points={[
    'The team marks every point on your floor plan, in the order to take them.',
    'Go to the next number and stand on that spot.',
    'Turn the way its arrow points, then take one photo.',
   ]} />

  <Lesson n={2} title="How to hold the phone" figure={<HoldDiagram />}
   lead="Upright, at chest height, and still."
   points={[
    'Hold the phone upright, not sideways.',
    'Keep it level at chest height. Do not tilt it up or down.',
    'Hold still for a second before you take the photo, so it comes out sharp.',
   ]} />

  <Lesson n={3} title="Light" figure={<LightDiagram />}
   lead="Bright, even light gives the clearest tour."
   points={[
    'Turn on every light in the room.',
    'Open the curtains and blinds.',
    'Do not shoot straight into a bright window. If a point faces one, take it when the sun is not shining in.',
   ]} />

  <Lesson n={4} title="Keep it clear" figure={<ClearDiagram />}
   lead="The tour is built from what stays the same between photos."
   points={[
    'No people or pets in the shot. Watch for your own reflection in mirrors.',
    'Switch off fans and screens, so nothing is moving.',
    'Leave the doors between rooms open, and do not move furniture until you have finished.',
   ]} />

  <Lesson n={5} title="If we ask for a retake" figure={<RetakeDiagram />}
   lead="Sometimes the team asks for a photo again. That is normal."
   points={[
    'A red ring on a point means that photo needs a retake.',
    'The note beside it tells you what to fix.',
    'Go back to that point, take the photo again, and send your photos to the team.',
   ]} />

  <Panel className="learn-check" padding="lg" aria-labelledby="learn-check-title">
   <div>
    <h2 id="learn-check-title">Before you start</h2>
    <ul>
     {checklist.map(item => <li key={item}><span className="learn-check-mark"><Icon name="check" size={14} /></span>{item}</li>)}
    </ul>
   </div>
   <div className="learn-check-go">
    <p>Ready? Open your space and the next point will be waiting.</p>
    <Button to="/spaces" size="lg" iconAfter="arrow">Go to your spaces</Button>
   </div>
  </Panel>
 </main>
}
