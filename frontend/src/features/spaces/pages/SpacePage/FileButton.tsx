import { useRef, type ReactNode } from 'react'
import { Button, type ButtonSize, type ButtonVariant, type IconName } from '../../../../shared/ui'
import { imageAccept } from '../../../tours/api/tourRequests'

type Props = {
 children: ReactNode
 onFiles: (files: File[]) => void
 multiple?: boolean
 disabled?: boolean
 variant?: ButtonVariant
 size?: ButtonSize
 icon?: IconName
 block?: boolean
}

/** A Button that opens the device's image picker. */
export default function FileButton({ children, onFiles, multiple, disabled, variant = 'secondary', size, icon, block }: Props) {
 const input = useRef<HTMLInputElement>(null)
 return <>
  <input ref={input} type="file" hidden tabIndex={-1} accept={imageAccept} multiple={multiple} disabled={disabled} onChange={event => {
   const files = Array.from(event.target.files ?? [])
   event.target.value = ''
   if (files.length) onFiles(files)
  }} />
  <Button variant={variant} size={size} icon={icon} block={block} disabled={disabled} onClick={() => input.current?.click()}>{children}</Button>
 </>
}
