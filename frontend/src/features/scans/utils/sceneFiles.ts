export type SelectedSceneFile = {
  file: File;
  relativePath: string;
};

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  }

  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${bytes} B`;
}

export async function readEntry(
  entry: FileSystemEntry,
  relativePath: string,
): Promise<SelectedSceneFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;

    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });

    return [{ file, relativePath }];
  }

  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntry;
    const reader = directory.createReader();
    const files: SelectedSceneFile[] = [];

    while (true) {
      const entries = await new Promise<FileSystemEntry[]>(
        (resolve, reject) => {
          reader.readEntries(resolve, reject);
        },
      );

      if (entries.length === 0) break;

      for (const child of entries) {
        const childPath = relativePath
          ? `${relativePath}/${child.name}`
          : child.name;

        const childFiles = await readEntry(child, childPath);
        for (const file of childFiles) files.push(file);
      }
    }

    return files;
  }

  return [];
}

