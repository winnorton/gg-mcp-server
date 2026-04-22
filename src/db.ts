import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'gg.db');

const db: DatabaseType = Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    session_date TEXT NOT NULL,
    player TEXT NOT NULL,
    shot_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    shot_number INTEGER NOT NULL,
    date TEXT,
    player TEXT,
    club_type TEXT NOT NULL,

    -- Club data (all in original units)
    club_speed REAL,           -- mph
    attack_angle REAL,         -- deg
    club_path REAL,            -- deg
    club_face REAL,            -- deg
    face_to_path REAL,         -- deg

    -- Ball data
    ball_speed REAL,           -- mph
    smash_factor REAL,
    launch_angle REAL,         -- deg
    launch_direction REAL,     -- deg

    -- Spin data
    backspin REAL,             -- rpm
    sidespin REAL,             -- rpm
    spin_rate REAL,            -- rpm
    spin_rate_type TEXT,       -- "Measured" or "Estimated"
    spin_axis REAL,            -- deg

    -- Distance/flight data
    apex_height REAL,          -- yds
    carry_distance REAL,       -- yds
    carry_deviation_angle REAL,  -- deg
    carry_deviation_distance REAL, -- yds
    total_distance REAL,       -- yds
    total_deviation_angle REAL,  -- deg
    total_deviation_distance REAL, -- yds

    -- Tags
    tag TEXT,

    -- Environmental
    air_density REAL,          -- g/L
    temperature REAL,          -- deg C
    air_pressure REAL,         -- kPa
    relative_humidity REAL,    -- %

    -- Tempo
    backswing_time REAL,       -- ms
    downswing_time REAL,       -- ms

    UNIQUE(session_id, shot_number)
  );

  CREATE INDEX IF NOT EXISTS idx_shots_session ON shots(session_id);
  CREATE INDEX IF NOT EXISTS idx_shots_club ON shots(club_type);
  CREATE INDEX IF NOT EXISTS idx_shots_date ON shots(date);
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
`);

export { db };

export function closeDb() {
  db.close();
}
