import { formatFileSize } from '../../utils/sceneFiles'
import './SceneFileList.css'
export default function SceneFileList({ files }: { files: { relativePath: string; sizeBytes: number }[] }) {
 return <ul className="scene-file-list">{files.map(file => <li key={file.relativePath}><span>{file.relativePath}</span><span>{formatFileSize(file.sizeBytes)}</span></li>)}</ul>
}
