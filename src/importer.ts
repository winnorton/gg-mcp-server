/**
 * CSV Importer for Garmin Golf driving range data.
 * 
 * Garmin CSVs have:
 *   Row 1: Column headers
 *   Row 2: Unit labels (e.g. [mph], [deg], [rpm])
 *   Row 3+: Data rows
 * 
 * Handles incremental import — skips files already in the database.
 */
import fs from 'fs';
import path from 'path';
import { db } from './db.js';

// Map CSV column headers → database column names
const COLUMN_MAP: Record<string, string> = {
  'Date': 'date',
  'Player': 'player',
  'Club Type': 'club_type',
  'Club Speed': 'club_speed',
  'Attack Angle': 'attack_angle',
  'Club Path': 'club_path',
  'Club Face': 'club_face',
  'Face to Path': 'face_to_path',
  'Ball Speed': 'ball_speed',
  'Smash Factor': 'smash_factor',
  'Launch Angle': 'launch_angle',
  'Launch Direction': 'launch_direction',
  'Backspin': 'backspin',
  'Sidespin': 'sidespin',
  'Spin Rate': 'spin_rate',
  'Spin Rate Type': 'spin_rate_type',
  'Spin Axis': 'spin_axis',
  'Apex Height': 'apex_height',
  'Carry Distance': 'carry_distance',
  'Carry Deviation Angle': 'carry_deviation_angle',
  'Carry Deviation Distance': 'carry_deviation_distance',
  'Total Distance': 'total_distance',
  'Total Deviation Angle': 'total_deviation_angle',
  'Total Deviation Distance': 'total_deviation_distance',
  'Tag': 'tag',
  'Air Density': 'air_density',
  'Temperature': 'temperature',
  'Air Pressure': 'air_pressure',
  'Relative Humidity': 'relative_humidity',
  'Backswing Time': 'backswing_time',
  'Downswing Time': 'downswing_time',
};

const TEXT_COLUMNS = new Set(['date', 'player', 'club_type', 'spin_rate_type', 'tag']);

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/** Extract session date from filename like "DrivingRange-2026-04-21 11-35-51-977(in).csv" */
function extractSessionDate(filename: string): string {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : 'unknown';
}

export function importCSV(filePath: string): { imported: number; skipped: boolean } {
  const filename = path.basename(filePath);

  // Check if already imported
  const existing = db.prepare('SELECT id FROM sessions WHERE filename = ?').get(filename);
  if (existing) {
    return { imported: 0, skipped: true };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);

  if (lines.length < 3) {
    return { imported: 0, skipped: false };
  }

  // Row 1: headers, Row 2: units (skip), Row 3+: data
  const headers = parseCSVLine(lines[0]);
  const dbColumns = headers.map(h => COLUMN_MAP[h] || null);

  const sessionDate = extractSessionDate(filename);

  // Detect player from first data row
  const firstDataRow = parseCSVLine(lines[2]);
  const playerIdx = headers.indexOf('Player');
  const player = playerIdx >= 0 ? firstDataRow[playerIdx] || 'Unknown' : 'Unknown';

  // Insert session
  const sessionResult = db.prepare(
    'INSERT INTO sessions (filename, session_date, player, shot_count) VALUES (?, ?, ?, ?)'
  ).run(filename, sessionDate, player, lines.length - 2);
  const sessionId = sessionResult.lastInsertRowid;

  // Prepare insert statement
  const insertColumns = dbColumns.filter(c => c !== null) as string[];
  const placeholders = insertColumns.map(() => '?').join(', ');
  const insertStmt = db.prepare(
    `INSERT INTO shots (session_id, shot_number, ${insertColumns.join(', ')}) VALUES (?, ?, ${placeholders})`
  );

  const insertAll = db.transaction(() => {
    let shotNumber = 0;
    for (let i = 2; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      shotNumber++;

      const params: (string | number | null)[] = [sessionId as number, shotNumber];
      for (let j = 0; j < headers.length; j++) {
        const col = dbColumns[j];
        if (col === null) continue;

        const raw = values[j];
        if (!raw || raw === '') {
          params.push(null);
        } else if (TEXT_COLUMNS.has(col)) {
          params.push(raw);
        } else {
          const num = parseFloat(raw);
          params.push(isNaN(num) ? null : num);
        }
      }
      insertStmt.run(...params);
    }
    return shotNumber;
  });

  const count = insertAll();

  // Update shot count
  db.prepare('UPDATE sessions SET shot_count = ? WHERE id = ?').run(count, sessionId);

  return { imported: count, skipped: false };
}

/** Import all CSV files from a directory */
export function importDirectory(dirPath: string): { files: number; shots: number; skipped: number } {
  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.csv'));
  let totalShots = 0;
  let totalFiles = 0;
  let skippedFiles = 0;

  for (const file of files) {
    const result = importCSV(path.join(dirPath, file));
    if (result.skipped) {
      skippedFiles++;
    } else {
      totalFiles++;
      totalShots += result.imported;
    }
  }

  return { files: totalFiles, shots: totalShots, skipped: skippedFiles };
}
