/**
 * Web API routes for the Garmin Golf web app.
 * 
 * Endpoints:
 *   GET  /api/sessions          - List sessions
 *   GET  /api/sessions/:id      - Session detail with shots
 *   GET  /api/clubs/stats       - Club stats summary
 *   GET  /api/trends/:metric    - Trend data for a metric
 *   GET  /api/dispersion/:club  - Dispersion analysis
 *   POST /api/upload             - Upload new CSV files
 *   POST /api/chat              - Natural language analysis via Ollama
 *   GET  /api/ollama/status     - Check Ollama availability
 *   GET  /api/features          - List feature requests
 *   POST /api/features          - Propose a feature
 *   POST /api/features/:id/implement - Auto-implement a feature
 */
import fs from 'fs';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { importCSV } from './importer.js';
import { chat, getOllamaStatus, autoImplementFeature, type ChatMessage } from './ollama.js';
import { proposeFeature, listFeatures, getFeature, updateFeatureStatus } from './features.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const apiRouter = express.Router();
apiRouter.use(express.json());

// ─── File Upload Config ─────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
const upload = multer({
  dest: DATA_DIR,
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// ─── Sessions ───────────────────────────────────────────────────────
apiRouter.get('/sessions', (_req, res) => {
  const sessions = db.prepare(`
    SELECT s.id, s.filename, s.session_date, s.player, s.shot_count, s.imported_at,
      GROUP_CONCAT(DISTINCT sh.club_type) as clubs_used
    FROM sessions s
    LEFT JOIN shots sh ON sh.session_id = s.id
    GROUP BY s.id ORDER BY s.session_date DESC
  `).all() as any[];

  res.json(sessions.map((s: any) => ({
    ...s,
    clubs_used: s.clubs_used?.split(',') || [],
  })));
});

apiRouter.get('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const shots = db.prepare('SELECT * FROM shots WHERE session_id = ? ORDER BY shot_number').all(req.params.id);
  res.json({ session, shots });
});

// ─── Club Stats ─────────────────────────────────────────────────────
apiRouter.get('/clubs/stats', (_req, res) => {
  const stats = db.prepare(`
    SELECT club_type,
      COUNT(*) as shot_count,
      ROUND(AVG(club_speed), 1) as avg_club_speed,
      ROUND(AVG(ball_speed), 1) as avg_ball_speed,
      ROUND(AVG(smash_factor), 3) as avg_smash_factor,
      ROUND(AVG(launch_angle), 1) as avg_launch_angle,
      ROUND(AVG(spin_rate), 0) as avg_spin_rate,
      ROUND(AVG(carry_distance), 1) as avg_carry,
      ROUND(AVG(total_distance), 1) as avg_total,
      ROUND(AVG(attack_angle), 1) as avg_attack_angle,
      ROUND(AVG(ABS(carry_deviation_distance)), 1) as avg_dispersion,
      ROUND(MIN(carry_distance), 1) as min_carry,
      ROUND(MAX(carry_distance), 1) as max_carry,
      ROUND(AVG(backswing_time), 0) as avg_backswing,
      ROUND(AVG(downswing_time), 0) as avg_downswing
    FROM shots GROUP BY club_type ORDER BY avg_carry DESC
  `).all();
  res.json(stats);
});

// ─── Trends ─────────────────────────────────────────────────────────
apiRouter.get('/trends/:metric', (req, res) => {
  const validMetrics = [
    'carry_distance', 'total_distance', 'ball_speed', 'club_speed',
    'smash_factor', 'launch_angle', 'spin_rate', 'apex_height',
    'attack_angle', 'club_path', 'club_face', 'face_to_path',
    'carry_deviation_distance', 'total_deviation_distance',
  ];
  const metric = req.params.metric;
  if (!validMetrics.includes(metric)) {
    return res.status(400).json({ error: `Invalid metric. Valid: ${validMetrics.join(', ')}` });
  }

  const club = req.query.club as string | undefined;
  let where = `WHERE sh.${metric} IS NOT NULL`;
  const params: any[] = [];
  if (club) { where += ' AND sh.club_type = ?'; params.push(club); }

  const trends = db.prepare(`
    SELECT s.session_date, sh.club_type,
      COUNT(*) as shots,
      ROUND(AVG(sh.${metric}), 2) as avg_value,
      ROUND(MIN(sh.${metric}), 2) as min_value,
      ROUND(MAX(sh.${metric}), 2) as max_value
    FROM shots sh JOIN sessions s ON s.id = sh.session_id
    ${where}
    GROUP BY s.id, sh.club_type
    ORDER BY s.session_date ASC
  `).all(...params);

  res.json({ metric, club: club || 'all', data: trends });
});

// ─── Dispersion ─────────────────────────────────────────────────────
apiRouter.get('/dispersion/:club', (req, res) => {
  const club = req.params.club;
  const shots = db.prepare(`
    SELECT carry_distance, carry_deviation_distance, total_distance, total_deviation_distance
    FROM shots WHERE club_type = ? AND carry_distance IS NOT NULL
  `).all(club) as any[];

  if (shots.length === 0) return res.status(404).json({ error: `No data for club "${club}"` });

  const carries = shots.map((s: any) => s.carry_distance);
  const devs = shots.map((s: any) => s.carry_deviation_distance).filter((v: any) => v != null);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stdDev = (arr: number[]) => {
    const m = avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  };

  res.json({
    club,
    shot_count: shots.length,
    carry: { avg: +avg(carries).toFixed(1), std_dev: +stdDev(carries).toFixed(1), min: Math.min(...carries), max: Math.max(...carries) },
    lateral: { avg: +avg(devs).toFixed(1), std_dev: +stdDev(devs).toFixed(1), left: devs.filter((d: number) => d < -5).length, straight: devs.filter((d: number) => Math.abs(d) <= 5).length, right: devs.filter((d: number) => d > 5).length },
    shots: shots.map((s: any) => ({ x: s.carry_deviation_distance || 0, y: s.carry_distance })),
  });
});

// ─── CSV Upload ─────────────────────────────────────────────────────
apiRouter.post('/upload', upload.array('files'), (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const results = [];
  for (const file of files) {
    const newPath = path.join(DATA_DIR, file.originalname);
    // multer saves with random name — rename to original
    fs.renameSync(file.path, newPath);
    try {
      const result = importCSV(newPath);
      results.push({ file: file.originalname, imported: result.imported, skipped: result.skipped });
    } catch (e) {
      results.push({ file: file.originalname, error: e instanceof Error ? e.message : String(e) });
    }
  }
  res.json({ results });
});

// ─── Ollama Chat ────────────────────────────────────────────────────
apiRouter.post('/chat', async (req, res) => {
  const { message, history, model } = req.body as {
    message: string;
    history?: ChatMessage[];
    model?: string;
  };
  if (!message) return res.status(400).json({ error: 'message is required' });

  const response = await chat(message, history || [], model);
  res.json({ response });
});

apiRouter.get('/ollama/status', async (_req, res) => {
  const status = await getOllamaStatus();
  res.json(status);
});

// ─── Feature Requests ───────────────────────────────────────────────
apiRouter.get('/features', (_req, res) => {
  const status = (_req.query.status as string) || undefined;
  res.json(listFeatures(status));
});

apiRouter.post('/features', (req, res) => {
  const { feature_name, description, justification, proposed_by } = req.body;
  if (!feature_name || !description) return res.status(400).json({ error: 'feature_name and description required' });
  const feature = proposeFeature(feature_name, description, justification, proposed_by);
  res.json(feature);
});

apiRouter.post('/features/:id/implement', async (req, res) => {
  const id = parseInt(req.params.id);
  const feature = getFeature(id);
  if (!feature) return res.status(404).json({ error: 'Feature not found' });

  updateFeatureStatus(id, 'implementing');
  const result = await autoImplementFeature(feature.feature_name, feature.description, req.body.model);

  if (result.success) {
    updateFeatureStatus(id, 'deployed', result.code);
    res.json({ status: 'deployed', code: result.code });
  } else {
    updateFeatureStatus(id, 'proposed', undefined, result.error);
    res.json({ status: 'failed', error: result.error });
  }
});

// ─── Dashboard Summary ──────────────────────────────────────────────
apiRouter.get('/dashboard', (_req, res) => {
  const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
  const shotCount = (db.prepare('SELECT COUNT(*) as c FROM shots').get() as any).c;
  const featureCount = (db.prepare('SELECT COUNT(*) as c FROM feature_requests').get() as any).c;
  const clubs = db.prepare('SELECT DISTINCT club_type FROM shots ORDER BY club_type').all() as any[];
  const latestSession = db.prepare('SELECT session_date FROM sessions ORDER BY session_date DESC LIMIT 1').get() as any;

  const topShots = db.prepare(`
    SELECT club_type, ROUND(MAX(carry_distance), 1) as best_carry, ROUND(MAX(total_distance), 1) as best_total
    FROM shots GROUP BY club_type ORDER BY best_carry DESC
  `).all();

  res.json({
    sessions: sessionCount,
    total_shots: shotCount,
    feature_requests: featureCount,
    clubs: clubs.map((c: any) => c.club_type),
    latest_session: latestSession?.session_date,
    personal_bests: topShots,
  });
});
