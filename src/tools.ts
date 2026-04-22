/**
 * MCP Tool Definitions for Garmin Golf data.
 * 
 * Tools:
 *   - gg_import_data: Import CSV files from the data directory
 *   - gg_list_sessions: List all imported driving range sessions
 *   - gg_session_detail: Get shot-by-shot data for a session
 *   - gg_club_stats: Aggregated stats per club type
 *   - gg_query_shots: Flexible SQL-like filtering on shot data
 *   - gg_trend_analysis: Track metrics over time across sessions
 *   - gg_compare_sessions: Side-by-side session comparison
 *   - gg_dispersion: Shot dispersion analysis for a club
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { importDirectory } from './importer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

export function registerTools(server: McpServer) {

  // ─── gg_import_data ───────────────────────────────────────────────
  server.tool(
    'gg_import_data',
    'Import Garmin Golf CSV files from the data/ directory into the database. Run this first if sessions show empty. Handles incremental imports — already-imported files are skipped.',
    {},
    async () => {
      try {
        const result = importDirectory(DATA_DIR);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              newFiles: result.files,
              newShots: result.shots,
              skippedFiles: result.skipped,
              dataDirectory: DATA_DIR,
            }, null, 2)
          }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Import error: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  // ─── gg_list_sessions ─────────────────────────────────────────────
  server.tool(
    'gg_list_sessions',
    'List all imported driving range sessions with dates, shot counts, and clubs used.',
    {},
    async () => {
      const sessions = db.prepare(`
        SELECT 
          s.id, s.filename, s.session_date, s.player, s.shot_count, s.imported_at,
          GROUP_CONCAT(DISTINCT sh.club_type) as clubs_used
        FROM sessions s
        LEFT JOIN shots sh ON sh.session_id = s.id
        GROUP BY s.id
        ORDER BY s.session_date DESC
      `).all() as any[];

      if (sessions.length === 0) {
        return { content: [{ type: 'text', text: 'No sessions found. Run gg_import_data first to import CSV files from the data/ directory.' }] };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(sessions.map(s => ({
            id: s.id,
            date: s.session_date,
            player: s.player,
            shots: s.shot_count,
            clubs: s.clubs_used?.split(',') || [],
            filename: s.filename,
          })), null, 2)
        }]
      };
    }
  );

  // ─── gg_session_detail ────────────────────────────────────────────
  server.tool(
    'gg_session_detail',
    'Get detailed shot-by-shot data for a specific session. Returns all metrics for every shot.',
    {
      session_id: z.number().describe('Session ID from gg_list_sessions'),
      club_filter: z.string().optional().describe('Optional club type filter, e.g. "Driver", "7 Iron"'),
    },
    async ({ session_id, club_filter }) => {
      let query = `
        SELECT * FROM shots WHERE session_id = ?
      `;
      const params: any[] = [session_id];

      if (club_filter) {
        query += ` AND club_type = ?`;
        params.push(club_filter);
      }
      query += ` ORDER BY shot_number`;

      const shots = db.prepare(query).all(...params) as any[];

      if (shots.length === 0) {
        return { content: [{ type: 'text', text: `No shots found for session ${session_id}${club_filter ? ` with club "${club_filter}"` : ''}.` }] };
      }

      // Summary stats at top
      const numericCols = ['club_speed', 'ball_speed', 'smash_factor', 'carry_distance', 'total_distance',
        'launch_angle', 'spin_rate', 'apex_height', 'attack_angle', 'club_path', 'club_face'];

      const summary: Record<string, any> = {};
      for (const col of numericCols) {
        const vals = shots.map((s: any) => s[col]).filter((v: any) => v !== null && v !== undefined) as number[];
        if (vals.length > 0) {
          summary[col] = {
            avg: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
            min: +Math.min(...vals).toFixed(1),
            max: +Math.max(...vals).toFixed(1),
          };
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id,
            club_filter: club_filter || 'all',
            shot_count: shots.length,
            summary,
            shots,
          }, null, 2)
        }]
      };
    }
  );

  // ─── gg_club_stats ────────────────────────────────────────────────
  server.tool(
    'gg_club_stats',
    'Get aggregated performance statistics broken down by club type. Shows averages, min, max, and standard deviation for all key metrics across all sessions or filtered to specific sessions.',
    {
      session_id: z.number().optional().describe('Optional: limit to a specific session'),
      club_type: z.string().optional().describe('Optional: filter to a specific club, e.g. "Driver"'),
    },
    async ({ session_id, club_type }) => {
      let where = 'WHERE 1=1';
      const params: any[] = [];

      if (session_id) {
        where += ' AND session_id = ?';
        params.push(session_id);
      }
      if (club_type) {
        where += ' AND club_type = ?';
        params.push(club_type);
      }

      const stats = db.prepare(`
        SELECT
          club_type,
          COUNT(*) as shot_count,

          ROUND(AVG(club_speed), 1) as avg_club_speed,
          ROUND(AVG(ball_speed), 1) as avg_ball_speed,
          ROUND(AVG(smash_factor), 3) as avg_smash_factor,
          ROUND(AVG(launch_angle), 1) as avg_launch_angle,
          ROUND(AVG(spin_rate), 0) as avg_spin_rate,
          ROUND(AVG(apex_height), 1) as avg_apex_height,
          ROUND(AVG(carry_distance), 1) as avg_carry_distance,
          ROUND(AVG(total_distance), 1) as avg_total_distance,
          ROUND(AVG(attack_angle), 1) as avg_attack_angle,
          ROUND(AVG(club_path), 1) as avg_club_path,
          ROUND(AVG(club_face), 1) as avg_club_face,
          ROUND(AVG(face_to_path), 1) as avg_face_to_path,

          ROUND(MIN(carry_distance), 1) as min_carry,
          ROUND(MAX(carry_distance), 1) as max_carry,
          ROUND(MIN(total_distance), 1) as min_total,
          ROUND(MAX(total_distance), 1) as max_total,

          ROUND(AVG(carry_deviation_distance), 1) as avg_carry_deviation,
          ROUND(AVG(ABS(carry_deviation_distance)), 1) as avg_abs_carry_deviation,
          ROUND(AVG(total_deviation_distance), 1) as avg_total_deviation,
          ROUND(AVG(ABS(total_deviation_distance)), 1) as avg_abs_total_deviation,

          ROUND(AVG(backswing_time), 0) as avg_backswing_ms,
          ROUND(AVG(downswing_time), 0) as avg_downswing_ms,

          -- Spin type breakdown
          SUM(CASE WHEN spin_rate_type = 'Measured' THEN 1 ELSE 0 END) as measured_spins,
          SUM(CASE WHEN spin_rate_type = 'Estimated' THEN 1 ELSE 0 END) as estimated_spins

        FROM shots
        ${where}
        GROUP BY club_type
        ORDER BY avg_carry_distance DESC
      `).all(...params);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(stats, null, 2)
        }]
      };
    }
  );

  // ─── gg_query_shots ───────────────────────────────────────────────
  server.tool(
    'gg_query_shots',
    'Flexible query tool to filter and analyze shot data. Supports filtering by club, distance ranges, spin, speed, etc. Returns matching shots with optional aggregation.',
    {
      club_type: z.string().optional().describe('Filter by club type, e.g. "Driver", "7 Iron", "3 Hybrid"'),
      min_carry: z.number().optional().describe('Minimum carry distance (yds)'),
      max_carry: z.number().optional().describe('Maximum carry distance (yds)'),
      min_ball_speed: z.number().optional().describe('Minimum ball speed (mph)'),
      min_club_speed: z.number().optional().describe('Minimum club speed (mph)'),
      spin_type: z.enum(['Measured', 'Estimated']).optional().describe('Filter by spin measurement type'),
      session_id: z.number().optional().describe('Limit to a specific session'),
      limit: z.number().optional().describe('Max results (default 50)'),
      aggregate: z.boolean().optional().describe('If true, return aggregate stats instead of individual shots'),
      order_by: z.string().optional().describe('Column to sort by (default: carry_distance DESC)'),
    },
    async (args) => {
      let where = 'WHERE 1=1';
      const params: any[] = [];

      if (args.club_type) { where += ' AND club_type = ?'; params.push(args.club_type); }
      if (args.min_carry !== undefined) { where += ' AND carry_distance >= ?'; params.push(args.min_carry); }
      if (args.max_carry !== undefined) { where += ' AND carry_distance <= ?'; params.push(args.max_carry); }
      if (args.min_ball_speed !== undefined) { where += ' AND ball_speed >= ?'; params.push(args.min_ball_speed); }
      if (args.min_club_speed !== undefined) { where += ' AND club_speed >= ?'; params.push(args.min_club_speed); }
      if (args.spin_type) { where += ' AND spin_rate_type = ?'; params.push(args.spin_type); }
      if (args.session_id !== undefined) { where += ' AND session_id = ?'; params.push(args.session_id); }

      if (args.aggregate) {
        const result = db.prepare(`
          SELECT 
            COUNT(*) as matching_shots,
            club_type,
            ROUND(AVG(club_speed), 1) as avg_club_speed,
            ROUND(AVG(ball_speed), 1) as avg_ball_speed,
            ROUND(AVG(smash_factor), 3) as avg_smash_factor,
            ROUND(AVG(carry_distance), 1) as avg_carry,
            ROUND(AVG(total_distance), 1) as avg_total,
            ROUND(AVG(launch_angle), 1) as avg_launch_angle,
            ROUND(AVG(spin_rate), 0) as avg_spin_rate,
            ROUND(AVG(attack_angle), 1) as avg_attack_angle,
            ROUND(MIN(carry_distance), 1) as min_carry,
            ROUND(MAX(carry_distance), 1) as max_carry
          FROM shots ${where}
          GROUP BY club_type
        `).all(...params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      const orderBy = args.order_by || 'carry_distance DESC';
      const limit = args.limit || 50;

      const shots = db.prepare(`
        SELECT 
          sh.*, s.session_date, s.filename
        FROM shots sh
        JOIN sessions s ON s.id = sh.session_id
        ${where}
        ORDER BY ${orderBy}
        LIMIT ?
      `).all(...params, limit);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: shots.length,
            filters: args,
            shots,
          }, null, 2)
        }]
      };
    }
  );

  // ─── gg_trend_analysis ────────────────────────────────────────────
  server.tool(
    'gg_trend_analysis',
    'Analyze how a specific metric trends over time across sessions. Great for tracking improvement in carry distance, ball speed, consistency, etc.',
    {
      metric: z.enum([
        'carry_distance', 'total_distance', 'ball_speed', 'club_speed',
        'smash_factor', 'launch_angle', 'spin_rate', 'apex_height',
        'attack_angle', 'club_path', 'club_face', 'face_to_path',
        'carry_deviation_distance', 'total_deviation_distance',
        'backswing_time', 'downswing_time'
      ]).describe('The metric to analyze over time'),
      club_type: z.string().optional().describe('Filter to a specific club type'),
    },
    async ({ metric, club_type }) => {
      let where = `WHERE ${metric} IS NOT NULL`;
      const params: any[] = [];
      if (club_type) {
        where += ' AND sh.club_type = ?';
        params.push(club_type);
      }

      const trends = db.prepare(`
        SELECT 
          s.session_date,
          s.filename,
          sh.club_type,
          COUNT(*) as shot_count,
          ROUND(AVG(sh.${metric}), 2) as avg_value,
          ROUND(MIN(sh.${metric}), 2) as min_value,
          ROUND(MAX(sh.${metric}), 2) as max_value,
          ROUND(AVG(sh.${metric} * sh.${metric}) - AVG(sh.${metric}) * AVG(sh.${metric}), 2) as variance
        FROM shots sh
        JOIN sessions s ON s.id = sh.session_id
        ${where}
        GROUP BY s.id, sh.club_type
        ORDER BY s.session_date ASC, sh.club_type
      `).all(...params) as any[];

      // Compute std dev from variance
      const result = trends.map((t: any) => ({
        ...t,
        std_dev: t.variance >= 0 ? +Math.sqrt(t.variance).toFixed(2) : null,
        variance: undefined,
      }));

      // Overall trend direction
      if (result.length >= 2) {
        const clubs = [...new Set(result.map((r: any) => r.club_type))];
        const trendSummary = clubs.map(club => {
          const clubData = result.filter((r: any) => r.club_type === club);
          if (clubData.length < 2) return null;
          const first = clubData[0].avg_value;
          const last = clubData[clubData.length - 1].avg_value;
          const change = +(last - first).toFixed(2);
          const pct = +((change / first) * 100).toFixed(1);
          return { club, first_session_avg: first, latest_session_avg: last, change, change_pct: `${pct}%` };
        }).filter(Boolean);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              metric,
              club_filter: club_type || 'all',
              trend_summary: trendSummary,
              per_session: result,
            }, null, 2)
          }]
        };
      }

      return { content: [{ type: 'text', text: JSON.stringify({ metric, per_session: result }, null, 2) }] };
    }
  );

  // ─── gg_compare_sessions ──────────────────────────────────────────
  server.tool(
    'gg_compare_sessions',
    'Compare two sessions side-by-side. Shows per-club deltas for all key metrics to identify what changed between practice sessions.',
    {
      session_a: z.number().describe('First session ID (earlier)'),
      session_b: z.number().describe('Second session ID (later)'),
      club_type: z.string().optional().describe('Optional: compare only a specific club'),
    },
    async ({ session_a, session_b, club_type }) => {
      const getStats = (sessionId: number) => {
        let where = 'WHERE session_id = ?';
        const params: any[] = [sessionId];
        if (club_type) { where += ' AND club_type = ?'; params.push(club_type); }

        return db.prepare(`
          SELECT 
            club_type,
            COUNT(*) as shots,
            ROUND(AVG(club_speed), 1) as avg_club_speed,
            ROUND(AVG(ball_speed), 1) as avg_ball_speed,
            ROUND(AVG(smash_factor), 3) as avg_smash_factor,
            ROUND(AVG(carry_distance), 1) as avg_carry,
            ROUND(AVG(total_distance), 1) as avg_total,
            ROUND(AVG(launch_angle), 1) as avg_launch_angle,
            ROUND(AVG(spin_rate), 0) as avg_spin_rate,
            ROUND(AVG(attack_angle), 1) as avg_attack_angle,
            ROUND(AVG(club_path), 1) as avg_club_path,
            ROUND(AVG(club_face), 1) as avg_club_face,
            ROUND(AVG(ABS(carry_deviation_distance)), 1) as avg_dispersion,
            ROUND(AVG(backswing_time), 0) as avg_backswing,
            ROUND(AVG(downswing_time), 0) as avg_downswing
          FROM shots ${where}
          GROUP BY club_type
        `).all(...params) as any[];
      };

      const statsA = getStats(session_a);
      const statsB = getStats(session_b);

      const sessionInfoA = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_a) as any;
      const sessionInfoB = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_b) as any;

      // Build comparison
      const allClubs = [...new Set([...statsA.map((s: any) => s.club_type), ...statsB.map((s: any) => s.club_type)])];
      const comparison = allClubs.map(club => {
        const a = statsA.find((s: any) => s.club_type === club);
        const b = statsB.find((s: any) => s.club_type === club);
        if (!a || !b) return { club, note: `Only present in ${a ? 'session A' : 'session B'}`, session_a: a, session_b: b };

        const deltas: Record<string, number> = {};
        const metrics = ['avg_club_speed', 'avg_ball_speed', 'avg_smash_factor', 'avg_carry', 'avg_total',
          'avg_launch_angle', 'avg_spin_rate', 'avg_attack_angle', 'avg_dispersion'];
        for (const m of metrics) {
          if (a[m] !== null && b[m] !== null) {
            deltas[`${m}_delta`] = +(b[m] - a[m]).toFixed(2);
          }
        }

        return { club, session_a: a, session_b: b, deltas };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_a: { id: session_a, date: sessionInfoA?.session_date, file: sessionInfoA?.filename },
            session_b: { id: session_b, date: sessionInfoB?.session_date, file: sessionInfoB?.filename },
            comparison,
          }, null, 2)
        }]
      };
    }
  );

  // ─── gg_dispersion ────────────────────────────────────────────────
  server.tool(
    'gg_dispersion',
    'Analyze shot dispersion (accuracy/consistency) for a specific club. Shows carry distance spread, left/right deviation distribution, and consistency metrics.',
    {
      club_type: z.string().describe('Club type to analyze, e.g. "Driver", "7 Iron"'),
      session_id: z.number().optional().describe('Optional: limit to a specific session'),
    },
    async ({ club_type, session_id }) => {
      let where = 'WHERE club_type = ? AND carry_distance IS NOT NULL';
      const params: any[] = [club_type];
      if (session_id !== undefined) { where += ' AND session_id = ?'; params.push(session_id); }

      const shots = db.prepare(`
        SELECT carry_distance, carry_deviation_distance, carry_deviation_angle,
               total_distance, total_deviation_distance, total_deviation_angle,
               club_speed, ball_speed, spin_rate, launch_angle
        FROM shots ${where}
        ORDER BY carry_distance
      `).all(...params) as any[];

      if (shots.length === 0) {
        return { content: [{ type: 'text', text: `No shots found for club "${club_type}".` }] };
      }

      const carryDistances = shots.map((s: any) => s.carry_distance as number);
      const deviations = shots.map((s: any) => s.carry_deviation_distance as number).filter(v => v !== null);
      const absDeviations = deviations.map(Math.abs);

      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const stdDev = (arr: number[]) => {
        const mean = avg(arr);
        return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length);
      };

      const sorted = [...carryDistances].sort((a, b) => a - b);
      const p10 = sorted[Math.floor(sorted.length * 0.1)];
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];

      const leftMisses = deviations.filter(d => d < -5).length;
      const rightMisses = deviations.filter(d => d > 5).length;
      const straight = deviations.filter(d => Math.abs(d) <= 5).length;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            club_type,
            shot_count: shots.length,
            carry_distance: {
              avg: +avg(carryDistances).toFixed(1),
              std_dev: +stdDev(carryDistances).toFixed(1),
              min: +Math.min(...carryDistances).toFixed(1),
              max: +Math.max(...carryDistances).toFixed(1),
              p10: +p10.toFixed(1),
              median: +p50.toFixed(1),
              p90: +p90.toFixed(1),
              spread_p10_p90: +(p90 - p10).toFixed(1),
            },
            lateral_dispersion: {
              avg_deviation: +avg(deviations).toFixed(1),
              avg_abs_deviation: +avg(absDeviations).toFixed(1),
              std_dev: +stdDev(deviations).toFixed(1),
              left_misses: leftMisses,
              straight: straight,
              right_misses: rightMisses,
              tendency: avg(deviations) < -3 ? 'LEFT' : avg(deviations) > 3 ? 'RIGHT' : 'NEUTRAL',
            },
          }, null, 2)
        }]
      };
    }
  );

  // ─── gg_best_shots ────────────────────────────────────────────────
  server.tool(
    'gg_best_shots',
    'Find your personal best shots by various criteria — longest carry, best smash factor, most spin, etc.',
    {
      metric: z.enum([
        'carry_distance', 'total_distance', 'ball_speed', 'club_speed',
        'smash_factor', 'spin_rate', 'apex_height'
      ]).describe('Metric to rank by'),
      club_type: z.string().optional().describe('Optional club filter'),
      limit: z.number().optional().describe('Number of results (default 10)'),
    },
    async ({ metric, club_type, limit: resultLimit }) => {
      let where = `WHERE ${metric} IS NOT NULL`;
      const params: any[] = [];
      if (club_type) { where += ' AND club_type = ?'; params.push(club_type); }

      const n = resultLimit || 10;
      const shots = db.prepare(`
        SELECT 
          sh.shot_number, sh.club_type, sh.date,
          sh.club_speed, sh.ball_speed, sh.smash_factor,
          sh.carry_distance, sh.total_distance,
          sh.launch_angle, sh.spin_rate, sh.spin_rate_type,
          sh.apex_height, sh.attack_angle, sh.club_path, sh.club_face,
          sh.carry_deviation_distance, sh.total_deviation_distance,
          s.session_date, s.filename
        FROM shots sh
        JOIN sessions s ON s.id = sh.session_id
        ${where}
        ORDER BY sh.${metric} DESC
        LIMIT ?
      `).all(...params, n);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ranking_metric: metric,
            club_filter: club_type || 'all',
            top_shots: shots,
          }, null, 2)
        }]
      };
    }
  );
}
