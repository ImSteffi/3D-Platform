import { useRef, useState } from 'react'
import { publishScan, type SavedScan } from '../api/scans'
import type { ScanDraft, UploadProgressState } from '../types'

const idle: UploadProgressState = { label: '', percent: 0 }

/**
 * publishScan reports progress as one text line. This is the single place that turns it into
 * a number and a plain label, so the components receive `percent` directly.
 */
function readProgress(message: string, previous: UploadProgressState): UploadProgressState {
 const uploading = message.match(/^Uploading (.+) — (\d+)%$/)
 if (uploading) return { label: `Uploading ${uploading[1]}`, percent: Math.min(100, Number(uploading[2])) }
 if (message === 'Verifying scan…') return { label: 'Checking the whole tour', percent: 100 }
 const verifying = message.match(/^Verifying (.+)…$/)
 if (verifying) return { label: `Checking ${verifying[1]}`, percent: previous.percent }
 if (message.startsWith('Preparing')) return { label: 'Preparing the upload', percent: previous.percent }
 return { label: message, percent: previous.percent }
}

export function useScanPublish(organizationId: number, projectId: number) {
 const [busy, setBusy] = useState(false)
 const [progress, setProgress] = useState<UploadProgressState>(idle)
 const [error, setError] = useState('')
 // Kept after a failure so "Retry upload" resumes the same server record instead of creating another.
 const [serverScan, setServerScan] = useState<SavedScan | null>(null)
 const publishing = useRef(false)
 async function publish(draft: ScanDraft): Promise<SavedScan | null> {
  if (publishing.current) return null
  publishing.current = true
  setBusy(true)
  setError('')
  setProgress(idle)
  try {
   return await publishScan(organizationId, projectId, draft, serverScan, setServerScan,
    message => setProgress(previous => readProgress(message, previous)))
  } catch (error) {
   setError(error instanceof Error ? error.message : 'The upload stopped. Choose Retry upload to continue.')
   return null
  } finally {
   publishing.current = false
   setBusy(false)
  }
 }
 return { busy, progress, error, serverScan, publish }
}
