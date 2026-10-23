import type { ReactNode } from 'react'
import './FormPanel.css'
export default function FormPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
 return <section className={`organization-form-panel ${className}`}>{children}</section>
}
