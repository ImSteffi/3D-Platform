import './PhotoTutorial.css'

/** Which rule a photo on the plan belongs to: the room photos (rule 2) or the doorway photos (rule 3). */
type Kind = 'room' | 'door'

/** A phone seen from above in a room: a small box with a lens line pointing along `angle` (degrees). */
function Phone({ x, y, angle, kind }: { x: number; y: number; angle: number; kind: Kind }) {
 return <g className={`dg-photo dg-photo--${kind}`} transform={`translate(${x} ${y}) rotate(${angle})`}>
  <rect x="-6" y="-4" width="12" height="8" rx="2" className="dg-ink dg-fill-amber" />
  <path className="dg-amber-line" d="M6 0h11" />
 </g>
}

/** One room of the example plan: its name, its middle, and its corners. */
type Room = { name: string; middle: [number, number]; corners: [number, number][] }

// Every room gets a photo from each corner, aimed at its middle.
const ROOMS: Room[] = [
 { name: 'Terrace', middle: [200, 46], corners: [[56, 28], [200, 26], [344, 28], [344, 64], [56, 64]] },
 { name: 'Living room', middle: [145, 135], corners: [[52, 102], [238, 102], [238, 168], [52, 168]] },
 { name: 'Bedroom', middle: [305, 135], corners: [[262, 102], [348, 102], [348, 168], [262, 168]] },
 { name: 'Corridor', middle: [200, 214], corners: [[52, 192], [52, 236], [348, 192], [348, 236]] },
 { name: 'Hall', middle: [80, 293], corners: [[52, 260], [108, 260], [108, 326], [52, 326]] },
 { name: 'Bath', middle: [150, 293], corners: [[132, 260], [168, 260], [168, 326], [132, 326]] },
 { name: 'Kitchen', middle: [270, 293], corners: [[192, 260], [348, 260], [348, 326], [192, 326]] },
]

/** Right in the middle of the corridor: two photos back to back, one aimed each way along it. [x, y, angle]. */
const ALONG: [number, number, number][] = [[188, 214, 180], [212, 214, 0]]

/**
 * Doorways: a photo from each side, looking through it. That is what joins the rooms together in the tour.
 * In the corridor it is taken from the far wall, so it sees into the room. [x, y, angle in degrees].
 */
const DOORWAYS: [number, number, number][] = [
 [170, 106, -90], [170, 76, 90], // living room and terrace
 [115, 164, 90], [115, 230, -90], // living room and corridor
 [305, 164, 90], [305, 230, -90], // bedroom and corridor
 [80, 264, -90], [80, 198, 90], // hall and corridor
 [150, 264, -90], [150, 198, 90], // bath and corridor
 [270, 264, -90], [270, 198, 90], // kitchen and corridor
]

function PlanDiagram() {
 const toward = ([x, y]: [number, number], [mx, my]: [number, number]) => Math.atan2(my - y, mx - x) * 180 / Math.PI
 return <svg className="dg" viewBox="0 0 400 348" role="img"
  aria-label="An example apartment seen from above: a terrace, a living room and bedroom, a corridor through the middle with the front door, and a hall, bath and kitchen. In every room there is a photo from each corner, aimed at the middle of that room. At every doorway there is a photo from each side, looking through it.">
  {/* Outside: the terrace has no walls of its own, only an edge with a way onto it at the top. */}
  <path className="dg-faint dg-dash" d="M185 14H46a6 6 0 0 0-6 6v50a6 6 0 0 0 6 6h308a6 6 0 0 0 6-6V20a6 6 0 0 0-6-6H215" />
  <rect x="40" y="90" width="320" height="248" className="dg-floor" />
  {/* Outer walls with the terrace door and the front door (into the corridor) left open. */}
  <path className="dg-wall" d="M40 90H150M190 90H360V338H40V229M40 199V90" />
  {/* Inner walls: the corridor runs through the middle, and every room has a doorway onto it. */}
  <path className="dg-wall" d="M250 90V180M40 180H100M130 180H290M320 180H360M40 248H65M95 248H135M165 248H255M285 248H360M120 248V338M180 248V338" />
  {ROOMS.map(room => <g key={room.name}>
   {room.corners.map(corner => <Phone key={`${corner[0]}-${corner[1]}`} x={corner[0]} y={corner[1]} angle={toward(corner, room.middle)} kind="room" />)}
  </g>)}
  {DOORWAYS.map(([x, y, angle]) => <Phone key={`door-${x}-${y}`} x={x} y={y} angle={angle} kind="door" />)}
  {ALONG.map(([x, y, angle]) => <Phone key={`along-${x}-${y}`} x={x} y={y} angle={angle} kind="room" />)}
 </svg>
}

/** Short enough to send as a message: the whole method in five lines. */
const RULES: { text: string; kind?: Kind }[] = [
 { text: 'Camera on 0.5x, phone in landscape, at waist height.' },
 { text: 'In every room, take a photo from each corner, aimed at the middle.', kind: 'room' },
 { text: 'At every doorway, take a photo looking through it, from both sides.', kind: 'door' },
 { text: 'Keep the doors open and the lighting the same. Don’t move anything.' },
 { text: 'At least 64 photos per floor. More is better.' },
]

/** The five rules over the example plan. */
export function TutorialRules() {
 return <div className="learn-side">
  <ol className="learn-rules">
   {RULES.map(({ text, kind }, index) => <li key={text}>
    <span className={`learn-n num${kind ? ` learn-n--${kind}` : ''}`} aria-hidden="true">{index + 1}</span>{text}
   </li>)}
  </ol>
  <div className="learn-figure"><PlanDiagram /></div>
 </div>
}

/** Real photos of a home, each shown where it was taken in its 3D tour. #t=1.5 shows the title frame before playing. */
export function TutorialVideo() {
 return <video className="learn-video" src="/videos/how-to-take-the-photos.mp4#t=1.5" controls playsInline preload="metadata"
  aria-label="Video: how to take the photos, and the 3D tour they make" />
}

/** The whole tutorial in one column: rules, plan, video. Used where there is no room for the Learn page's two columns. */
export default function PhotoTutorial({ className = '' }: { className?: string }) {
 return <div className={`photo-tutorial ${className}`.trim()}>
  <TutorialRules />
  <TutorialVideo />
 </div>
}
