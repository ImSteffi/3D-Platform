import './UploadProgress.css'
export default function UploadProgress({ message }: { message: string }) {
 const percent = Number(message.match(/— (\d+)%/)?.[1] ?? 0)
 return <div className="upload-progress" role="status"><div className="upload-progress-track"><span style={{ width: `${percent}%` }} /></div><p>{message} Keep this page open.</p></div>
}
