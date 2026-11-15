import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

type Props = {
 /** The plan image; its proportions decide how wide the plan may get. */
 src: string
 /** Vertical space, in px, taken by everything else on screen. The plan gets the rest of the window height. */
 reserve?: number
 children: ReactNode
}

/**
 * Sizes a flat plan so the whole drawing fits the window height: PlanView always fills its container's width,
 * so the width is capped at (available height x the image's proportions).
 */
export default function FitPlan({ src, reserve = 300, children }: Props) {
 const [measured, setMeasured] = useState<{ src: string; ratio: number } | null>(null)
 useEffect(() => {
  let active = true
  const image = new Image()
  image.onload = () => { if (active && image.naturalWidth && image.naturalHeight) setMeasured({ src, ratio: image.naturalWidth / image.naturalHeight }) }
  image.src = src
  return () => { active = false }
 }, [src])
 const ratio = measured?.src === src ? measured.ratio : 1.4
 const style = { '--plan-ratio': ratio.toFixed(4), '--plan-reserve': reserve + 'px' } as CSSProperties
 return <div className="fit-plan" style={style}>{children}</div>
}
