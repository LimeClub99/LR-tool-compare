// File output: prefer the File System Access API (one folder pick, then N
// writes); fall back to individual <a download> triggers.

export interface OutputSink {
  /** Display name for the destination (e.g. folder name, or "Downloads"). */
  label: string;
  write(relativePath: string, data: Uint8Array | string): Promise<void>;
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

interface DirHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
}
interface FileHandle {
  kind: 'file';
  createWritable(): Promise<WritableStream<Uint8Array | string> & { write(d: any): Promise<void>; close(): Promise<void> }>;
}

async function pickDirectory(): Promise<DirHandle> {
  return await (window as any).showDirectoryPicker({ mode: 'readwrite' });
}

async function nestedDir(root: DirHandle, parts: string[]): Promise<DirHandle> {
  let cur = root;
  for (const p of parts) {
    cur = await cur.getDirectoryHandle(p, { create: true });
  }
  return cur;
}

export async function pickOutputSink(): Promise<OutputSink> {
  if (supportsDirectoryPicker()) {
    const root = await pickDirectory();
    return {
      label: root.name,
      async write(relativePath, data) {
        const parts = relativePath.split('/').filter(Boolean);
        const fileName = parts.pop()!;
        const dir = await nestedDir(root, parts);
        const fh = await dir.getFileHandle(fileName, { create: true });
        const stream = await fh.createWritable();
        await stream.write(data as any);
        await stream.close();
      },
    };
  }

  // Fallback: trigger an individual download per file. Will prompt N times
  // and will probably be blocked after the first one in most browsers, so
  // this is a poor experience - we warn the caller upstream.
  return {
    label: 'Downloads (one prompt per file)',
    async write(relativePath, data) {
      const blob = typeof data === 'string'
        ? new Blob([data], { type: 'application/json' })
        : new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = relativePath.replace(/\//g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a tick to consume the URL before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    },
  };
}
