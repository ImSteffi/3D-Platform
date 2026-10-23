import { useRef, useState } from 'react'
import { publishScan, type SavedScan } from '../api/scans'
import type { ScanDraft } from '../types'

export function useScanPublish(organizationId: number, projectId: number) {
 const [busy, setBusy] = useState(false)
 const [progress, setProgress] = useState('')
 const [error, setError] = useState('')
 const [serverScan, setServerScan] = useState<SavedScan | null>(null)
 const publishing = useRef(false)
 async function publish(draft: ScanDraft): Promise<SavedScan | null> {
  if (publishing.current) return null
  publishing.current = true
  setBusy(true)
  setError('')
  try {
   return await publishScan(organizationId, projectId, draft, serverScan, setServerScan, setProgress)
  } catch (error) {
   setError(error instanceof Error ? error.message : 'Upload failed. Please retry.')
   return null
  } finally {
   publishing.current = false
   setBusy(false)
  }
 }
 return { busy, progress, error, serverScan, publish }
}
