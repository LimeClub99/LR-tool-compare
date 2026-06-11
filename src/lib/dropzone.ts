// Walk a DataTransferItemList (from a drop event) and return a flat list of
// File objects with `webkitRelativePath` populated, so dropped folders and
// dropped files can be processed by the same matching logic.

interface FSEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(cb: (f: File) => void, err?: (e: any) => void): void;
  createReader?(): { readEntries(cb: (entries: FSEntry[]) => void, err?: (e: any) => void): void };
}

async function walkEntry(entry: FSEntry, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file: File = await new Promise((resolve, reject) =>
      entry.file!(resolve, reject),
    );
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        value: rel,
        configurable: true,
      });
    } catch {
      /* some files may have non-configurable property; ignore */
    }
    out.push(file);
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    // readEntries returns batches - keep calling until empty.
    while (true) {
      const batch: FSEntry[] = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) break;
      await Promise.all(batch.map((e) => walkEntry(e, nextPrefix, out)));
    }
  }
}

export async function collectFromDataTransfer(
  items: DataTransferItemList,
): Promise<File[]> {
  const out: File[] = [];
  const entries: FSEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const e = (item as any).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  await Promise.all(entries.map((e) => walkEntry(e, '', out)));
  return out;
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirHandle | FileHandle>;
}
interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

async function walkHandle(dir: DirHandle, prefix: string, out: File[]): Promise<void> {
  for await (const child of dir.values()) {
    const rel = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.kind === 'directory') {
      await walkHandle(child as DirHandle, rel, out);
    } else {
      const file = await (child as FileHandle).getFile();
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: rel,
          configurable: true,
        });
      } catch {
        /* ignore */
      }
      out.push(file);
    }
  }
}

/** Open the OS folder picker and return every file inside (recursively) as
 *  a File with `webkitRelativePath` set relative to the picked folder. The
 *  returned `handle` (when available) can be re-read later to refresh. */
export async function pickDirectoryFiles(): Promise<{ folderName: string; files: File[]; handle: any } | null> {
  if (!supportsDirectoryPicker()) return null;
  const root = await (window as any).showDirectoryPicker({ mode: 'read' });
  const files = await readFilesFromHandle(root);
  return { folderName: root.name, files, handle: root };
}

/** Re-walk a previously picked directory handle and return its files. */
export async function readFilesFromHandle(handle: any): Promise<File[]> {
  const out: File[] = [];
  await walkHandle(handle as DirHandle, handle.name, out);
  return out;
}
