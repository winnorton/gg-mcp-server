/**
 * Feature Request system — allows agents to propose new tools/features
 * and tracks their lifecycle from proposal → auto-implementation → deployed.
 * 
 * Features are stored in SQLite and can be auto-implemented via Ollama.
 */
import { db } from './db.js';

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS feature_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_name TEXT NOT NULL,
    description TEXT NOT NULL,
    justification TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',  -- proposed, planned, implementing, deployed, rejected
    proposed_by TEXT DEFAULT 'agent',
    proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
    implemented_at TEXT,
    implementation_code TEXT,
    error_log TEXT
  );
`);

export interface FeatureRequest {
  id: number;
  feature_name: string;
  description: string;
  justification: string | null;
  status: string;
  proposed_by: string;
  proposed_at: string;
  implemented_at: string | null;
  implementation_code: string | null;
  error_log: string | null;
}

export function proposeFeature(name: string, description: string, justification?: string, proposedBy?: string): FeatureRequest {
  const result = db.prepare(`
    INSERT INTO feature_requests (feature_name, description, justification, proposed_by)
    VALUES (?, ?, ?, ?)
  `).run(name, description, justification || null, proposedBy || 'agent');

  return db.prepare('SELECT * FROM feature_requests WHERE id = ?').get(result.lastInsertRowid) as FeatureRequest;
}

export function listFeatures(status?: string): FeatureRequest[] {
  if (status) {
    return db.prepare('SELECT * FROM feature_requests WHERE status = ? ORDER BY proposed_at DESC').all(status) as FeatureRequest[];
  }
  return db.prepare('SELECT * FROM feature_requests ORDER BY proposed_at DESC').all() as FeatureRequest[];
}

export function updateFeatureStatus(id: number, status: string, code?: string, error?: string): void {
  const updates: string[] = ['status = ?'];
  const params: any[] = [status];

  if (status === 'deployed') {
    updates.push("implemented_at = datetime('now')");
  }
  if (code) {
    updates.push('implementation_code = ?');
    params.push(code);
  }
  if (error) {
    updates.push('error_log = ?');
    params.push(error);
  }

  params.push(id);
  db.prepare(`UPDATE feature_requests SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}

export function getFeature(id: number): FeatureRequest | undefined {
  return db.prepare('SELECT * FROM feature_requests WHERE id = ?').get(id) as FeatureRequest | undefined;
}
