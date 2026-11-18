import type { ReactNode } from 'react'
import { Button, Icon, Panel } from '../../../../shared/ui'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import './LearnPage.css'

/** A thin callout line that starts with a small dot on the thing it names. */
function Callout({ x1, y1, x2, y2, tone = '' }: { x1: number; y1: number; x2: number; y2: number; tone?: '' | 'red' }) {
 return <g className={tone === 'red' ? 'dg-call dg-call--red' : 'dg-call'}>
  <path d={`M${x1} ${y1}L${x2} ${y2}`} />
  <circle cx={x1} cy={y1} r="2.2" />
 </g>
}

/** A phone seen from above in a room: a small box with a lens line pointing along `angle` (degrees). */
function Phone({ x, y, angle }: { x: number; y: number; angle: number }) {
 return <g transform={`translate(${x} ${y}) rotate(${angle})`}>
  <rect x="-6" y="-4" width="12" height="8" rx="2" className="dg-ink dg-fill-amber" />
  <path className="dg-amber-line" d="M6 0h11" />
 </g>
}

/** One room of the example plan: its name, its middle, and the stops along its walls. */
type Room = { name: string; middle: [number, number]; label: [number, number]; stops: [number, number][] }

// Every room gets a photo from each corner, plus more along the walls of bigger rooms.
const ROOMS: Room[] = [
 { name: 'Terrace', middle: [200, 46], label: [200, 30], stops: [[56, 28], [344, 28], [344, 64], [56, 64], [120, 64], [280, 64]] },
 { name: 'Living room', middle: [155, 145], label: [155, 149], stops: [[52, 102], [110, 102], [222, 102], [258, 102], [258, 188], [160, 188], [52, 188], [52, 145]] },
 { name: 'Bedroom', middle: [315, 145], label: [320, 168], stops: [[282, 102], [348, 102], [348, 188], [282, 188]] },
 { name: 'Hall', middle: [85, 244], label: [85, 248], stops: [[52, 212], [118, 212], [118, 268], [52, 268]] },
 { name: 'Bath', middle: [165, 240], label: [152, 244], stops: [[142, 212], [188, 212], [188, 268], [142, 268]] },
 { name: 'Kitchen', middle: [280, 240], label: [280, 244], stops: [[212, 212], [348, 212], [348, 268], [280, 268], [212, 268]] },
]

/**
 * Doorways: just before each one, a photo looking through it, from both sides. That is what joins the rooms
 * together in the tour. [x, y, angle in degrees].
 */
const DOORWAYS: [number, number, number][] = [
 [170, 106, -90], [170, 76, 90], // living room and terrace
 [254, 140, 0], [286, 140, 180], // living room and bedroom
 [86, 184, 90], [86, 216, -90], // living room and hall
 [235, 184, 90], [235, 216, -90], // living room and kitchen
 [186, 241, 0], [214, 241, 180], // bath and kitchen
 [52, 235, 180], // hall and the front door
]

function WalkDiagram() {
 const toward = ([x, y]: [number, number], [mx, my]: [number, number]) => Math.atan2(my - y, mx - x) * 180 / Math.PI
 return <svg className="dg" viewBox="0 0 400 290" role="img"
  aria-label="An example apartment seen from above: a terrace, living room, bedroom, hall, bath and kitchen. In every room there is a photo from each corner and more along the walls, all pointing towards the middle of that room. At every doorway there is a photo from each side, looking through it.">
  {/* Outside: the terrace has no walls of its own. */}
  <rect x="40" y="14" width="320" height="62" rx="6" className="dg-faint dg-dash" fill="none" />
  <rect x="40" y="90" width="320" height="190" className="dg-floor" />
  {/* Outer walls with the terrace door and the front door left open. */}
  <path className="dg-wall" d="M40 90H150M190 90H360V280H40V250M40 220V90" />
  {/* Inner walls, each with a doorway. */}
  <path className="dg-wall" d="M270 90V122M270 158V200M40 200H66M106 200H222M248 200H360M130 200V280M200 200V226M200 256V280" />
  {ROOMS.map(room => <g key={room.name}>
   <text x={room.label[0]} y={room.label[1]} className="dg-sub" textAnchor="middle">{room.name}</text>
   {room.stops.map(stop => <Phone key={`${stop[0]}-${stop[1]}`} x={stop[0]} y={stop[1]} angle={toward(stop, room.middle)} />)}
  </g>)}
  {DOORWAYS.map(([x, y, angle]) => <Phone key={`door-${x}-${y}`} x={x} y={y} angle={angle} />)}
 </svg>
}

function HoldDiagram() {
 return <svg className="dg" viewBox="0 0 400 260" role="img"
  aria-label="A person seen from the side holding a phone sideways at waist height. Callouts: 0.5x zoom, horizontal, waist height.">
  <path className="dg-faint" d="M90 236H300" />
  <circle cx="170" cy="48" r="16" className="dg-ink" />
  <rect x="156" y="70" width="28" height="84" rx="14" className="dg-ink" />
  <path className="dg-ink" d="M164 153L160 236h12M176 153l6 83h12" />
  <path className="dg-ink" d="M172 100l10 40 34-6" />
  <rect x="212" y="122" width="44" height="24" rx="5" className="dg-ink dg-fill-amber" />
  <circle cx="220" cy="134" r="2" className="dg-dot" />
  <path className="dg-faint dg-dash" d="M110 134H212" />
  <path className="dg-call" d="M110 134V236M104 134h12M104 236h12" />
  <text x="100" y="182" className="dg-label" textAnchor="end">Waist</text>
  <text x="100" y="197" className="dg-label" textAnchor="end">height</text>
  <Callout x1={256} y1={128} x2={300} y2={96} />
  <text x="306" y="94" className="dg-label">Horizontal</text>
  <Callout x1={240} y1={146} x2={300} y2={168} />
  <text x="306" y="166" className="dg-label">0.5x zoom</text>
  <text x="306" y="181" className="dg-sub">the wide lens</text>
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

function UploadDiagram() {
 return <svg className="dg" viewBox="0 0 400 220" role="img"
  aria-label="A floor card with an Add photos button and a row of photos.">
  <rect x="30" y="30" width="340" height="160" rx="16" className="dg-floor" />
  <text x="52" y="62" className="dg-label">Ground floor</text>
  <rect x="262" y="44" width="92" height="28" rx="14" className="dg-ink dg-fill-amber" />
  <text x="308" y="63" className="dg-label" textAnchor="middle">Add photos</text>
  {[0, 1, 2, 3, 4].map(i => <rect key={i} x={52 + i * 62} y={98} width="52" height="40" rx="6" className="dg-ink dg-fill-paper" />)}
  <text x="52" y="168" className="dg-sub">One floor, all its photos</text>
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
 'Camera on 0.5x zoom',
 'Phone horizontal, at waist height',
 'Lights on, curtains open, doors open',
 'Nobody in the shot, nothing moving',
 'Walk along the walls, camera towards the middle',
 'A photo from every corner of every room',
 'A photo through every doorway, from both sides',
 'Stand still for every photo',
 'Every room, plenty of photos',
]

export default function LearnPage() {
 useShellMode('place')
 return <main className="page learn-page">
  <header className="page-header"><div>
   <h1>How to take the photos</h1>
   <p>All you need is your phone. A few minutes per room, no experience needed.</p>
  </div></header>

  <Lesson n={1} title="Set up your camera" figure={<HoldDiagram />}
   lead="0.5x zoom, phone horizontal, at waist height."
   points={[
    'Switch the camera to 0.5x zoom, the wide lens, so each photo sees more of the room.',
    'Hold your phone horizontally, not upright.',
    'Keep it at around waist height and level: do not tilt it up or down.',
   ]} />

  <Lesson n={2} title="Walk along the walls" figure={<WalkDiagram />}
   lead="Keep the camera pointed towards the middle of the room."
   points={[
    'Start at a wall and walk slowly along the walls of the room.',
    'Take a photo from every corner of every room, aimed at the middle, even in small rooms.',
    'Stop every few steps and take a photo. Stand completely still for each one, so it comes out sharp.',
    'Keep going until you are back where you started, then do the same in the next room, including small ones like the hall and bathroom.',
    'Outside areas such as a terrace or balcony count too: walk along their edge the same way.',
    'At every doorway, take a photo just before it, looking through into the next room. Then do the same from the other side. These photos join the rooms together.',
    'Capture as much of the space as you can. Too many photos is never a problem: the more angles, the better.',
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

  <Lesson n={5} title="Add them to your space" figure={<UploadDiagram />}
   lead="Upload the photos under the right floor."
   points={[
    'Open your space and find the floor the photos belong to.',
    'Press Add photos and choose all of that floor’s photos at once. iPhone photos work as they are.',
    'They upload one by one. Once all your photos are in, we make your 3D tour.',
   ]} />

  <Panel className="learn-check" padding="lg" aria-labelledby="learn-check-title">
   <div>
    <h2 id="learn-check-title">Before you start</h2>
    <ul>
     {checklist.map(item => <li key={item}><span className="learn-check-mark"><Icon name="check" size={14} /></span>{item}</li>)}
    </ul>
   </div>
   <div className="learn-check-go">
    <p>Ready? Take the photos, then add them to your space.</p>
    <Button to="/spaces" size="lg" iconAfter="arrow">Go to your spaces</Button>
   </div>
  </Panel>
 </main>
}
