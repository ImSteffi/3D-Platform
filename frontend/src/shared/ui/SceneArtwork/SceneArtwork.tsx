import './SceneArtwork.css'
export default function SceneArtwork({ variant = 0 }: { variant?: number }) {
 return <div className={`scene-art scene-art--${variant % 3}`} aria-hidden="true">
  <div className="scene-art-grid" />
  <svg viewBox="0 0 400 230" fill="none">
   <path d="m55 160 150 66 150-80-150-66-150 80Z" stroke="currentColor" opacity=".25" />
   <path d="m90 137 115 51 115-61-115-51-115 61Z" fill="currentColor" fillOpacity=".03" stroke="currentColor" />
   <path d="M90 137V88l115-61 115 51v49M205 188V76M90 88l115 51 115-61M205 139v49" stroke="currentColor" />
   <path d="m126 104 42-23 38 17 45-24M126 104v48M168 81v48M251 74v90M168 129l38-21 45 20M205 27v49M145 59l115 51" stroke="currentColor" opacity=".5" />
   <path d="m252 164 35-19v-26l-35 19v26ZM107 96v28l32 14v-28l-32-14Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" opacity=".6" />
   <circle cx="205" cy="139" r="4" fill="currentColor" />
   <path d="M205 147v18M188 139h-14M222 139h14" stroke="currentColor" opacity=".5" />
  </svg>
 </div>
}
