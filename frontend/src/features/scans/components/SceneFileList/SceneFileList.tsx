import { formatFileSize } from '../../utils/sceneFiles'
import './SceneFileList.css'

export default function SceneFileList({ files }: { files: { relativePath: string; sizeBytes: number }[] }) {
 if (files.length === 0) return null
 return <ul className="scene-file-list" aria-label="Files">
  {files.map(file => <li key={file.relativePath}><span>{file.relativePath}</span><span>{formatFileSize(file.sizeBytes)}</span></li>)}
 </ul>
}
