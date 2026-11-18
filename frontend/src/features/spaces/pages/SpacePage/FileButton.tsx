import { useRef, type ReactNode } from 'react'
import { Button, type ButtonSize, type ButtonVariant, type IconName } from '../../../../shared/ui'
import { imagePickerAccept } from '../../../tours/api/prepareImage'

type Props = {
 children: ReactNode
 onFiles: (files: File[]) => void
 multiple?: boolean
 disabled?: boolean
 variant?: ButtonVariant
 size?: ButtonSize
 icon?: IconName
 block?: boolean
 /** File types the picker offers. Default: images, including iPhone HEIC. */
 accept?: string
}

/** A Button that opens the device's image picker. */
export default function FileButton({ children, onFiles, multiple, disabled, variant = 'secondary', size, icon, block, accept = imagePickerAccept }: Props) {
 const input = useRef<HTMLInputElement>(null)
 return <>
  <input ref={input} type="file" hidden tabIndex={-1} accept={accept} multiple={multiple} disabled={disabled} onChange={event => {
   const files = Array.from(event.target.files ?? [])
   event.target.value = ''
   if (files.length) onFiles(files)
  }} />
  <Button variant={variant} size={size} icon={icon} block={block} disabled={disabled} onClick={() => input.current?.click()}>{children}</Button>
 </>
}
