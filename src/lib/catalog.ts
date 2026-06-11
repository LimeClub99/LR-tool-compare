import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { parseDevelopSettings } from './lua';
import {
  PARAMETER_DEFAULTS,
  TARGET_PARAMETERS,
  TargetParam,
} from './config';

let _sql: Promise<SqlJsStatic> | null = null;

export function loadSql(): Promise<SqlJsStatic> {
  if (_sql) return _sql;
  const p = initSqlJs({
    locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
  });
  _sql = p;
  return p;
}

export async function openCatalog(file: File): Promise<Database> {
  const SQL = await loadSql();
  const buf = new Uint8Array(await file.arrayBuffer());
  return new SQL.Database(buf);
}

export type DevelopSettings = Record<TargetParam, number>;

// Some AI editing tools write a -999999 sentinel into the sliders to mark "no
// value produced" instead of omitting the key. No real Lightroom slider sits
// anywhere near this low (Tint, the most negative, floors at -150), so any
// value below the floor means the record is junk. Drop the whole image rather
// than let the sentinel poison the per-slider means.
const SENTINEL_FLOOR = -9999;

function hasSentinel(parsed: Record<string, number>): boolean {
  for (const p of TARGET_PARAMETERS) {
    const v = parsed[p];
    if (v !== undefined && v < SENTINEL_FLOOR) return true;
  }
  return false;
}

function isEdited(parsed: Record<string, number>): boolean {
  // An image counts as edited if ANY target parameter has a non-default value.
  for (const p of TARGET_PARAMETERS) {
    const v = parsed[p];
    if (v === undefined) continue;
    if (v !== PARAMETER_DEFAULTS[p]) return true;
  }
  return false;
}

function fillDefaults(parsed: Record<string, number>): DevelopSettings {
  const s = {} as DevelopSettings;
  for (const p of TARGET_PARAMETERS) {
    s[p] = parsed[p] ?? PARAMETER_DEFAULTS[p];
  }
  return s;
}

export interface ExtractOptions {
  imageIds: number[];
  onlyEdited: boolean;
}

export function extractSettings(
  db: Database,
  opts: ExtractOptions,
): Map<number, DevelopSettings> {
  const out = new Map<number, DevelopSettings>();
  if (opts.imageIds.length === 0) return out;

  // SQLite default SQLITE_MAX_VARIABLE_NUMBER is 999 - chunk to stay well under.
  const CHUNK = 500;
  for (let i = 0; i < opts.imageIds.length; i += CHUNK) {
    const chunk = opts.imageIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const sql = `SELECT image, text FROM Adobe_imageDevelopSettings WHERE image IN (${placeholders})`;
    const stmt = db.prepare(sql);
    stmt.bind(chunk as unknown as number[]);
    while (stmt.step()) {
      const row = stmt.get();
      const id = row[0] as number;
      const text = row[1] as string | null;
      if (!text) continue;
      const parsed = parseDevelopSettings(text);
      if (hasSentinel(parsed)) continue;
      if (opts.onlyEdited && !isEdited(parsed)) continue;
      out.set(id, fillDefaults(parsed));
    }
    stmt.free();
  }
  return out;
}

export function getCatalogImageCount(db: Database): number {
  const res = db.exec('SELECT COUNT(*) FROM Adobe_images');
  if (!res.length) return 0;
  return Number(res[0].values[0][0]);
}
