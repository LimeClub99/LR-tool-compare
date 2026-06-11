// Folder hierarchy reads from a master .lrcat - port of catalog/folder_tree.py.
import type { Database } from 'sql.js';

export interface FolderInfo {
  folderId: number;
  path: string;
  imageCount: number;
}

export interface RootFolderInfo {
  rootId: number;
  rootName: string;
  rootPath: string;
  totalImages: number;
  subfolders: FolderInfo[];
}

export function getFolderHierarchy(db: Database): RootFolderInfo[] {
  const roots: RootFolderInfo[] = [];
  const rootRes = db.exec(
    'SELECT id_local, absolutePath FROM AgLibraryRootFolder ORDER BY absolutePath',
  );
  if (!rootRes.length) return roots;

  for (const row of rootRes[0].values) {
    const rootId = Number(row[0]);
    const rootPath = (row[1] as string | null) ?? '';
    const trimmed = rootPath.replace(/\/+$/, '');
    const rootName = trimmed.includes('/')
      ? trimmed.slice(trimmed.lastIndexOf('/') + 1)
      : trimmed || String(rootId);

    const stmt = db.prepare(`
      SELECT f.id_local, f.pathFromRoot, COUNT(fi.id_local) AS image_count
      FROM AgLibraryFolder f
      LEFT JOIN AgLibraryFile fi ON fi.folder = f.id_local
      WHERE f.rootFolder = ?
      GROUP BY f.id_local
      ORDER BY f.pathFromRoot
    `);
    stmt.bind([rootId]);
    const subfolders: FolderInfo[] = [];
    let total = 0;
    while (stmt.step()) {
      const r = stmt.get();
      const count = Number(r[2]);
      subfolders.push({
        folderId: Number(r[0]),
        path: (r[1] as string | null) ?? '',
        imageCount: count,
      });
      total += count;
    }
    stmt.free();

    roots.push({
      rootId,
      rootName,
      rootPath,
      totalImages: total,
      subfolders,
    });
  }

  return roots;
}

export function getImageIdsForFolders(
  db: Database,
  folderIds: number[],
): number[] {
  if (!folderIds.length) return [];
  const ids: number[] = [];
  const CHUNK = 500;
  for (let i = 0; i < folderIds.length; i += CHUNK) {
    const chunk = folderIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT img.id_local
      FROM Adobe_images img
      JOIN AgLibraryFile fi ON fi.id_local = img.rootFile
      WHERE fi.folder IN (${placeholders})
    `);
    stmt.bind(chunk);
    while (stmt.step()) ids.push(Number(stmt.get()[0]));
    stmt.free();
  }
  return ids;
}

export function getAllImageIds(db: Database): number[] {
  const ids: number[] = [];
  const stmt = db.prepare('SELECT id_local FROM Adobe_images');
  while (stmt.step()) ids.push(Number(stmt.get()[0]));
  stmt.free();
  return ids;
}
