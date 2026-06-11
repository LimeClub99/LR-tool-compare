// Port of src/catalog/writer.py - applies train/test markers and develop-
// settings resets to an open sql.js Database.

import type { Database } from 'sql.js';
import { buildDefaultSettings, extractCameraInfo } from './defaultSettings';

export const TRAIN_RATING = 5;
export const TEST_RATING = 1;
export const TRAIN_KEYWORD = 'train';
export const TEST_KEYWORD = 'test';

function uuid4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (shouldn't be needed in any browser this app targets).
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function setRatings(db: Database, imageIds: number[], rating: number): number {
  if (!imageIds.length) return 0;
  let n = 0;
  for (const chunk of chunked(imageIds, 500)) {
    const placeholders = chunk.map(() => '?').join(',');
    const stmt = db.prepare(
      `UPDATE Adobe_images SET rating = ? WHERE id_local IN (${placeholders})`,
    );
    stmt.bind([rating, ...chunk]);
    stmt.step();
    n += db.getRowsModified();
    stmt.free();
  }
  return n;
}

function ensureKeyword(db: Database, name: string): number {
  const lc = name.toLowerCase();
  const stmt = db.prepare(
    'SELECT id_local FROM AgLibraryKeyword WHERE lc_name = ?',
  );
  stmt.bind([lc]);
  if (stmt.step()) {
    const id = Number(stmt.get()[0]);
    stmt.free();
    return id;
  }
  stmt.free();

  const maxRes = db.exec('SELECT MAX(id_local) FROM AgLibraryKeyword');
  const max = maxRes.length && maxRes[0].values[0][0] != null ? Number(maxRes[0].values[0][0]) : 0;
  const newId = max + 1;
  const ins = db.prepare(
    `INSERT INTO AgLibraryKeyword (id_local, id_global, dateCreated, name, lc_name)
     VALUES (?, ?, julianday('now'), ?, ?)`,
  );
  ins.bind([newId, uuid4(), name, lc]);
  ins.step();
  ins.free();
  return newId;
}

export function assignKeyword(db: Database, imageIds: number[], name: string): number {
  if (!imageIds.length) return 0;
  const tagId = ensureKeyword(db, name);

  // Find existing links so we don't insert duplicates.
  const existing = new Set<number>();
  for (const chunk of chunked(imageIds, 500)) {
    const placeholders = chunk.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT image FROM AgLibraryKeywordImage WHERE tag = ? AND image IN (${placeholders})`,
    );
    stmt.bind([tagId, ...chunk]);
    while (stmt.step()) existing.add(Number(stmt.get()[0]));
    stmt.free();
  }

  let newLinks = 0;
  const ins = db.prepare(
    'INSERT INTO AgLibraryKeywordImage (image, tag) VALUES (?, ?)',
  );
  for (const id of imageIds) {
    if (existing.has(id)) continue;
    ins.bind([id, tagId]);
    ins.step();
    ins.reset();
    newLinks++;
  }
  ins.free();

  if (newLinks > 0) {
    db.run(
      `UPDATE AgLibraryKeyword
         SET imageCountCache = (SELECT COUNT(*) FROM AgLibraryKeywordImage WHERE tag = ?)
       WHERE id_local = ?`,
      [tagId, tagId],
    );

    const popRes = db.exec(
      'SELECT id_local FROM AgLibraryKeywordPopularity WHERE tag = ?',
      [tagId],
    );
    if (!popRes.length || !popRes[0].values.length) {
      const maxPop = db.exec('SELECT MAX(id_local) FROM AgLibraryKeywordPopularity');
      const maxId = maxPop.length && maxPop[0].values[0][0] != null
        ? Number(maxPop[0].values[0][0])
        : 0;
      db.run(
        `INSERT INTO AgLibraryKeywordPopularity (id_local, tag, occurrences, popularity)
         VALUES (?, ?, ?, ?)`,
        [maxId + 1, tagId, newLinks, newLinks],
      );
    } else {
      db.run(
        `UPDATE AgLibraryKeywordPopularity
           SET occurrences = occurrences + ?
         WHERE tag = ?`,
        [newLinks, tagId],
      );
    }
  }

  return newLinks;
}

export function resetDevelopSettings(db: Database, imageIds: number[]): number {
  if (!imageIds.length) return 0;

  // 1. Read existing camera info per image so we can preserve it.
  const cameraInfo = new Map<number, { cameraProfile: string; cameraProfileDigest: string }>();
  for (const chunk of chunked(imageIds, 500)) {
    const placeholders = chunk.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT image, text FROM Adobe_imageDevelopSettings WHERE image IN (${placeholders})`,
    );
    stmt.bind(chunk);
    while (stmt.step()) {
      const row = stmt.get();
      const id = Number(row[0]);
      const text = row[1] as string | null;
      cameraInfo.set(
        id,
        text ? extractCameraInfo(text) : { cameraProfile: 'Adobe Standard', cameraProfileDigest: '' },
      );
    }
    stmt.free();
  }

  // 2. Write default settings text per image.
  let rows = 0;
  const upd = db.prepare(
    `UPDATE Adobe_imageDevelopSettings
       SET text = ?,
           digest = NULL,
           historySettingsID = NULL,
           hasDevelopAdjustments = NULL,
           hasDevelopAdjustmentsEx = -1.0,
           whiteBalance = 'As Shot',
           processVersion = '15.4',
           hasSettings1 = NULL,
           hasSettings2 = NULL,
           beforeSettingsIDCache = NULL,
           profileCorrections = 0.0,
           removeChromaticAberration = 0.0
     WHERE image = ?`,
  );
  for (const id of imageIds) {
    const info = cameraInfo.get(id) ?? { cameraProfile: 'Adobe Standard', cameraProfileDigest: '' };
    upd.bind([buildDefaultSettings(info.cameraProfile, info.cameraProfileDigest), id]);
    upd.step();
    upd.reset();
    rows += db.getRowsModified();
  }
  upd.free();

  // 3. Delete history steps + snapshots so LR can't reconstruct old edits.
  for (const chunk of chunked(imageIds, 500)) {
    const placeholders = chunk.map(() => '?').join(',');
    db.run(
      `DELETE FROM Adobe_libraryImageDevelopHistoryStep WHERE image IN (${placeholders})`,
      chunk,
    );
    db.run(
      `DELETE FROM Adobe_libraryImageDevelopSnapshot WHERE image IN (${placeholders})`,
      chunk,
    );
  }

  return rows;
}

export function markTrainImages(db: Database, imageIds: number[]) {
  setRatings(db, imageIds, TRAIN_RATING);
  assignKeyword(db, imageIds, TRAIN_KEYWORD);
}

export function markTestImages(db: Database, imageIds: number[]) {
  setRatings(db, imageIds, TEST_RATING);
  assignKeyword(db, imageIds, TEST_KEYWORD);
}

export function updateRootFolderPaths(db: Database, absolutePath: string) {
  // Optional path override - mirrors path_resolver.update_root_folder_path.
  let p = absolutePath;
  if (p && !p.endsWith('/')) p += '/';
  db.run('UPDATE AgLibraryRootFolder SET absolutePath = ?', [p]);
}

function tablesWithImageColumn(db: Database): string[] {
  // Find every user table that has an `image` column referencing
  // Adobe_images.id_local, so we can prune rows pointing at deleted images.
  const tablesRes = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  if (!tablesRes.length) return [];
  const matched: string[] = [];
  for (const row of tablesRes[0].values) {
    const name = String(row[0]);
    const cols = db.exec(`PRAGMA table_info("${name}")`);
    if (!cols.length) continue;
    // table_info returns rows of [cid, name, type, notnull, dflt_value, pk].
    if (cols[0].values.some((c) => String(c[1]) === 'image')) matched.push(name);
  }
  return matched;
}

/**
 * Reduce the catalog to only the given image IDs. Deletes Adobe_images rows
 * outside the keep set, every dependent row in tables that reference images,
 * and any AgLibraryFile / AgLibraryFolder rows that become orphaned. VACUUMs
 * at the end so the exported file actually shrinks.
 */
export function pruneCatalog(db: Database, keepIds: number[]): void {
  db.run('CREATE TEMP TABLE _keep_images (id INTEGER PRIMARY KEY)');
  try {
    const ins = db.prepare('INSERT OR IGNORE INTO _keep_images (id) VALUES (?)');
    for (const id of keepIds) {
      ins.bind([id]);
      ins.step();
      ins.reset();
    }
    ins.free();

    for (const table of tablesWithImageColumn(db)) {
      db.run(
        `DELETE FROM "${table}" WHERE image NOT IN (SELECT id FROM _keep_images)`,
      );
    }

    db.run('DELETE FROM Adobe_images WHERE id_local NOT IN (SELECT id FROM _keep_images)');

    // Orphan cleanup: files no image references, then folders with no files,
    // then root folders with no folders. Lightroom tolerates leftovers but
    // they bloat the file and confuse the library panel.
    db.run(`
      DELETE FROM AgLibraryFile
       WHERE id_local NOT IN (SELECT rootFile FROM Adobe_images WHERE rootFile IS NOT NULL)
    `);
    db.run(`
      DELETE FROM AgLibraryFolder
       WHERE id_local NOT IN (SELECT folder FROM AgLibraryFile WHERE folder IS NOT NULL)
    `);
    db.run(`
      DELETE FROM AgLibraryRootFolder
       WHERE id_local NOT IN (SELECT rootFolder FROM AgLibraryFolder WHERE rootFolder IS NOT NULL)
    `);
  } finally {
    db.run('DROP TABLE IF EXISTS _keep_images');
  }

  db.run('VACUUM');
}
