/**
 * Ollama integration for natural language golf analysis.
 * 
 * Two modes:
 *   1. Chat — conversational golf analysis with tool-calling context
 *   2. Auto-implement — generate tool code from feature requests
 */
import { Ollama } from 'ollama';
import { db } from './db.js';

const ollama = new Ollama();

const SYSTEM_PROMPT = `You are a golf performance analyst with deep expertise in launch monitor data from the Garmin Approach R10.
You have access to a database of driving range sessions. When answering questions:
- Use specific numbers from the data when available
- Explain what metrics mean in practical golf terms
- Suggest actionable improvements based on the data
- Compare to typical amateur benchmarks when relevant

Key metrics reference:
- Smash Factor: Ball speed / Club speed. Driver ideal: 1.45-1.50. Iron ideal: 1.33-1.38
- Attack Angle: Negative = hitting down (good for irons), Positive = hitting up (good for driver)
- Club Path: 0 = straight. Negative = left (out-to-in). Positive = right (in-to-out)
- Face to Path: Determines curve. Negative = draws/hooks. Positive = fades/slices
- Spin Rate: Driver ideal: 2000-2800 RPM. 7-Iron ideal: 6000-7500 RPM
- Launch Angle: Driver ideal: 12-15°. 7-Iron ideal: 18-22°

The user's data includes: club speed, ball speed, smash factor, carry/total distance, 
deviation, spin (backspin/sidespin/rate), attack angle, club path, face angle, 
apex height, tempo (backswing/downswing time), and environmental conditions.`;

/** Build a data context string from recent session stats */
function buildDataContext(): string {
  const sessions = db.prepare(`
    SELECT s.id, s.session_date, s.shot_count,
      GROUP_CONCAT(DISTINCT sh.club_type) as clubs
    FROM sessions s LEFT JOIN shots sh ON sh.session_id = s.id
    GROUP BY s.id ORDER BY s.session_date DESC LIMIT 10
  `).all() as any[];

  const clubStats = db.prepare(`
    SELECT club_type,
      COUNT(*) as shots,
      ROUND(AVG(carry_distance), 1) as avg_carry,
      ROUND(AVG(total_distance), 1) as avg_total,
      ROUND(AVG(ball_speed), 1) as avg_ball_speed,
      ROUND(AVG(club_speed), 1) as avg_club_speed,
      ROUND(AVG(smash_factor), 3) as avg_smash,
      ROUND(AVG(spin_rate), 0) as avg_spin,
      ROUND(AVG(launch_angle), 1) as avg_launch,
      ROUND(AVG(attack_angle), 1) as avg_attack,
      ROUND(AVG(ABS(carry_deviation_distance)), 1) as avg_dispersion
    FROM shots GROUP BY club_type ORDER BY avg_carry DESC
  `).all() as any[];

  let ctx = `\n\n--- PLAYER DATA SUMMARY ---\nSessions: ${sessions.length}\n`;
  for (const s of sessions) {
    ctx += `  ${s.session_date}: ${s.shot_count} shots (${s.clubs})\n`;
  }
  ctx += `\nClub Averages:\n`;
  for (const c of clubStats) {
    ctx += `  ${c.club_type}: ${c.avg_carry}y carry, ${c.avg_total}y total, ` +
      `${c.avg_ball_speed}mph ball, ${c.avg_smash} smash, ${c.avg_spin}rpm spin, ` +
      `${c.avg_launch}° launch, ${c.avg_attack}° attack, ±${c.avg_dispersion}y dispersion (${c.shots} shots)\n`;
  }

  return ctx;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Conversational golf analysis */
export async function chat(userMessage: string, history: ChatMessage[] = [], model = 'gemma3:12b'): Promise<string> {
  const dataContext = buildDataContext();
  
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT + dataContext },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    const response = await ollama.chat({ model, messages });
    return response.message.content;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return '⚠️ Ollama is not running. Start it with `ollama serve` and ensure you have a model pulled (e.g. `ollama pull gemma3:12b`).';
    }
    return `⚠️ Ollama error: ${msg}`;
  }
}

/** Check if Ollama is available and which models are installed */
export async function getOllamaStatus(): Promise<{ available: boolean; models: string[]; error?: string }> {
  try {
    const list = await ollama.list();
    return {
      available: true,
      models: list.models.map(m => m.name),
    };
  } catch (e) {
    return {
      available: false,
      models: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Auto-implement a feature request using Ollama code generation */
export async function autoImplementFeature(
  featureName: string,
  description: string,
  model = 'gemma3:12b'
): Promise<{ success: boolean; code?: string; error?: string }> {
  const prompt = `You are a TypeScript developer. Generate a new MCP tool implementation for a Garmin Golf data server.

The tool should be a standalone function that can be registered with the MCP server.
The database has these tables:
- sessions (id, filename, session_date, player, shot_count)
- shots (id, session_id, shot_number, date, player, club_type, club_speed, attack_angle, club_path, club_face, face_to_path, ball_speed, smash_factor, launch_angle, launch_direction, backspin, sidespin, spin_rate, spin_rate_type, spin_axis, apex_height, carry_distance, carry_deviation_angle, carry_deviation_distance, total_distance, total_deviation_angle, total_deviation_distance, tag, air_density, temperature, air_pressure, relative_humidity, backswing_time, downswing_time)

Feature Request:
Name: ${featureName}
Description: ${description}

Generate ONLY the TypeScript code for a function that takes (server: McpServer) and registers one tool.
Use imports from './db.js' for the database and 'zod' for input validation.
Return valid TypeScript that compiles. Do NOT include markdown formatting, code fences, or explanations.`;

  try {
    const response = await ollama.chat({
      model,
      messages: [{ role: 'user', content: prompt }],
    });
    return { success: true, code: response.message.content };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
