// ─────────────────────────────────────────────────────────────────────────────
// Export / import — the honest local-first replacement for "your history is
// safe on our server".
//
// Everything the app knows about you fits in one JSON file: the session log
// and the settings blob. You own that file. If you clear site data without
// it, the history is gone — there is no copy anywhere else, and the UI says
// so plainly rather than implying a safety net that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

import { allSessions, replaceAllSessions, type SessionRecord } from './db';
import { DEFAULT_PROFILE, loadProfile, saveProfile, type LocalProfile } from './settings';

export const BACKUP_VERSION = 1;

export interface PranaBackup {
  format: 'prana.os/backup';
  version: number;
  exported_at: string;
  profile: LocalProfile;
  sessions: SessionRecord[];
}

export async function exportData(): Promise<PranaBackup> {
  return {
    format: 'prana.os/backup',
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    profile: loadProfile(),
    sessions: await allSessions(),
  };
}

/** Serialises a backup and hands it to the browser as a dated download. */
export async function downloadBackup(): Promise<void> {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prana-backup-${data.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isSessionRecord(v: unknown): v is SessionRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string'
    && typeof r.started_at === 'string'
    && typeof r.duration_minutes === 'number';
}

/**
 * Restores a backup, replacing everything currently stored. Validates the
 * envelope first: a truncated or unrelated JSON file must fail loudly rather
 * than half-import and leave the history in an in-between state.
 */
export async function importData(raw: unknown): Promise<{ ok: true; sessions: number } | { ok: false; error: string }> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a Prana backup file.' };

  const backup = raw as Partial<PranaBackup>;
  if (backup.format !== 'prana.os/backup') return { ok: false, error: 'Not a Prana backup file.' };
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app.' };
  }
  if (!Array.isArray(backup.sessions) || !backup.sessions.every(isSessionRecord)) {
    return { ok: false, error: 'The session history in this file is missing or malformed.' };
  }

  try {
    await replaceAllSessions(backup.sessions);
    saveProfile({ ...DEFAULT_PROFILE, ...(backup.profile ?? {}) });
    return { ok: true, sessions: backup.sessions.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Import failed.' };
  }
}

/** Reads a user-picked file and imports it. */
export async function importFromFile(file: File) {
  try {
    return await importData(JSON.parse(await file.text()));
  } catch {
    return { ok: false as const, error: 'That file is not valid JSON.' };
  }
}
