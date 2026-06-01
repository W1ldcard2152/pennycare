// Marker file helpers for backup targets.
//
// A backup target is a folder (USB drive root, OneDrive sync folder, etc.)
// that the user has designated to receive copies of every backup. We identify
// targets by writing a marker file (`.pennycare-backup-target.json`) at the
// folder root. The file contains a UUID that's also stored in the database,
// so even if the folder gets moved or a different drive happens to use the
// same drive letter on a later boot, we won't mistakenly write to it.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const MARKER_FILENAME = '.pennycare-backup-target.json';

export interface MarkerFile {
  id: string;             // UUID — must match BackupTarget.markerId in the DB
  name: string;           // Friendly name, captured at registration time
  appName: 'PennyCare';   // Sanity check that this is one of our markers
  registeredAt: string;   // ISO timestamp
  version: 1;             // Schema version for future changes
}

export function newMarkerId(): string {
  return crypto.randomUUID();
}

export function readMarker(folderPath: string): MarkerFile | null {
  try {
    const markerPath = path.join(folderPath, MARKER_FILENAME);
    if (!fs.existsSync(markerPath)) return null;
    const raw = fs.readFileSync(markerPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed?.appName !== 'PennyCare') return null;
    if (typeof parsed?.id !== 'string') return null;
    return parsed as MarkerFile;
  } catch {
    return null;
  }
}

export function writeMarker(folderPath: string, marker: MarkerFile): void {
  const markerPath = path.join(folderPath, MARKER_FILENAME);
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
}

export function deleteMarker(folderPath: string): void {
  try {
    const markerPath = path.join(folderPath, MARKER_FILENAME);
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  } catch {
    // Best-effort; the user can delete it manually if needed
  }
}

// Verify that a registered target is currently usable: the folder exists,
// the marker file exists, and the marker's id matches what we have on
// record. Returns the reason it failed (for UI status display) or null
// on success.
export type TargetVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'folder_missing' | 'marker_missing' | 'marker_mismatch' };

export function verifyTarget(folderPath: string, expectedMarkerId: string): TargetVerifyResult {
  if (!fs.existsSync(folderPath)) {
    return { ok: false, reason: 'folder_missing' };
  }
  const marker = readMarker(folderPath);
  if (!marker) {
    return { ok: false, reason: 'marker_missing' };
  }
  if (marker.id !== expectedMarkerId) {
    return { ok: false, reason: 'marker_mismatch' };
  }
  return { ok: true };
}

// Validate a folder path the user provided as a candidate target.
// Doesn't write anything — just checks that the path is usable.
export type FolderValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateCandidateFolder(folderPath: string): FolderValidation {
  if (!folderPath || typeof folderPath !== 'string' || folderPath.trim().length === 0) {
    return { ok: false, error: 'Folder path is required' };
  }
  if (!path.isAbsolute(folderPath)) {
    return { ok: false, error: 'Folder path must be absolute (e.g., D:\\backups or /Volumes/USB/backups)' };
  }
  if (!fs.existsSync(folderPath)) {
    return { ok: false, error: 'Folder does not exist' };
  }
  try {
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return { ok: false, error: 'Path is not a directory' };
    }
  } catch {
    return { ok: false, error: 'Could not read folder' };
  }
  // Verify writability by attempting to create + remove a test file
  const testPath = path.join(folderPath, `.pennycare-write-test-${Date.now()}`);
  try {
    fs.writeFileSync(testPath, 'test', 'utf-8');
    fs.unlinkSync(testPath);
  } catch {
    return { ok: false, error: 'Folder is not writable (try a different folder or check permissions)' };
  }
  return { ok: true };
}
