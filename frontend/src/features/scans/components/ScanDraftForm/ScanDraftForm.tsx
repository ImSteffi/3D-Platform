import type { ScanDraft } from '../../types'
import Icon from '../../../../shared/ui/Icon/Icon'
import SceneFileList from '../SceneFileList/SceneFileList'
import './ScanDraftForm.css'
import FormPanel from '../../../../shared/ui/FormPanel/FormPanel'
import { useId, useRef, useState, type DragEvent, type FormEvent } from 'react';
import Button from '../../../../shared/ui/Button/Button.tsx';
import TextField from '../../../../shared/ui/TextField/TextField.tsx';
import { formatFileSize, readEntry, type SelectedSceneFile } from '../../utils/sceneFiles.ts';

type ScanDraftFormProps = {
  onAdd: (scan: ScanDraft) => void;
  onCancel: () => void;
};

export default function ScanDraftForm({ onAdd, onCancel }: ScanDraftFormProps) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<SelectedSceneFile[]>([]);
  const [error, setError] = useState("");
  const [selectionName, setSelectionName] = useState("");
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);

  const totalSize = files.reduce((total, item) => total + item.file.size, 0);

  function selectFolder(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || readingRef.current) return;

    const selected = Array.from(fileList)
      .map((file) => ({
        file,
        relativePath:
          file.webkitRelativePath.split("/").slice(1).join("/") || file.name,
      }))
      .sort((first, second) =>
        first.relativePath.localeCompare(second.relativePath),
      );
    setSelectionName(
      fileList[0].webkitRelativePath.split("/")[0] || "Selected files",
    );

    setFiles(selected);
    setError("");
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (readingRef.current) return;

    // Capture dropped entries before awaiting directory reads.
    const entries = Array.from(event.dataTransfer.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);

    if (entries.length === 0) {
      setError("Drop a folder or files from your computer.");
      return;
    }

    readingRef.current = true;
    setReading(true);
    setError("");

    try {
      const selected: SelectedSceneFile[] = [];
      const singleFolder = entries.length === 1 && entries[0].isDirectory;

      for (const entry of entries) {
        const rootPath = singleFolder ? "" : entry.name;
        const entryFiles = await readEntry(entry, rootPath);
        for (const file of entryFiles) selected.push(file);
      }

      if (selected.length === 0) {
        throw new Error("The selected folder contains no files.");
      }

      const paths = new Set(selected.map((item) => item.relativePath));

      if (paths.size !== selected.length) {
        throw new Error("Some files have the same relative path.");
      }

      selected.sort((first, second) =>
        first.relativePath.localeCompare(second.relativePath),
      );

      setFiles(selected);
      setSelectionName(singleFolder ? entries[0].name : "Selected files");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not read the selected files.",
      );
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingRef.current) return;
    if (!name.trim()) {
      setError('Enter a scan name.');
      return;
    }
    if (files.length === 0) {
      setError('Choose a folder or drop files for this scan.');
      return;
    }
    onAdd({ id: crypto.randomUUID(), name: name.trim(), files });
  }

  return (
    <FormPanel className="scan-form-panel">
      <h4>New scan</h4>
      <form className="project-form" onSubmit={handleSubmit}>
        <fieldset disabled={reading} className="organization-form-fields">
          <TextField
            id={`${inputId}-name`}
            name="scanName"
            label="Scan name"
            value={name}
            onChange={setName}
          />

          <div
            className="file-dropzone"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleDrop}
          >
            <Icon name="upload" size={28} /><label htmlFor={`${inputId}-folder`}>
              Drop your scene here
            </label>
            <p>
              Drop this scan’s folder or files here, or choose a folder below.
              Subfolders are included.
            </p>
            <input
              id={`${inputId}-folder`}
              name="sceneFolder"
              type="file"
              multiple
              ref={(input) => {
                input?.setAttribute("webkitdirectory", "");
              }}
              onChange={(event) => {
                selectFolder(event.target.files);
                event.target.value = "";
              }}
            />
            {reading && <p role="status">Reading folder contents…</p>}
          </div>

          {files.length > 0 && (
            <section className="scene-file-selection">
              <div className="selected-project-file">
                <div>
                  <strong>{selectionName}</strong>
                  <p>
                    {files.length} files · {formatFileSize(totalSize)}
                    {" · "}Not uploaded
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFiles([]);
                    setSelectionName('');
                    setError('');
                  }}
                >
                  Clear selection
                </Button>
              </div>

              <SceneFileList files={files.map(({file, relativePath}) => ({relativePath, sizeBytes: file.size}))} />
            </section>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="organization-form-actions">
            <Button type="submit"><Icon name="plus" size={14} />Add scan draft</Button>

            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </FormPanel>
  );
}
