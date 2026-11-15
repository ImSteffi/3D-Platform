import './UploadProgress.css'

type UploadProgressProps = {
 /** How much of the upload has been sent, 0–100. */
 percent: number
 /** What is happening now, for example "Uploading scene.sog". */
 label: string
}

export default function UploadProgress({ percent, label }: UploadProgressProps) {
 const value = Math.max(0, Math.min(100, Math.round(percent)))
 return <div className="upload-progress">
  <div className="upload-progress-head">
   <p className="upload-progress-label" role="status">{label || 'Preparing the upload'}</p>
   <span className="upload-progress-value" aria-hidden="true">{value}%</span>
  </div>
  <div className="upload-progress-track" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
   <span style={{ width: `${value}%` }} />
  </div>
  <p className="upload-progress-note">Keep this page open until the upload finishes.</p>
 </div>
}
