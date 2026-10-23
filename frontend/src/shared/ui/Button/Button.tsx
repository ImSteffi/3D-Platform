import './Button.css'
import type { ReactNode } from 'react'

type ButtonProps = {
  children: ReactNode
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost'
  onClick?: () => void
}

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  onClick,
}: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  )
}
