/**
 * gg-mcp-server — Garmin Golf MCP Server + Web App
 * 
 * Provides AI agents with structured access to Garmin driving range
 * session data (Approach R10/R50 exports), plus a web dashboard
 * with natural language analysis via Ollama.
 * 
 * Transports:
 *   stdio (default) — for Gemini CLI / Claude Desktop
 *   --sse           — HTTP server with web dashboard + SSE MCP transport
 */
import fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, closeDb } from './db.js';
import { importDirectory } from './importer.js';
import { registerTools } from './tools.js';
import { registerFeatureTools } from './feature_tools.js';
import { apiRouter } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

const server = new McpServer({
  name: 'gg-mcp-server',
  version: '1.0.0',
});

// Register all tools
registerTools(server);
registerFeatureTools(server);

// ─── Auto-import on startup ─────────────────────────────────────────
function autoImport() {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.error(`[auto-import] Created data/ directory at ${DATA_DIR}`);
  }

  try {
    const result = importDirectory(DATA_DIR);
    if (result.files > 0) {
      console.error(`[auto-import] Imported ${result.files} new file(s), ${result.shots} shots`);
    }
    if (result.skipped > 0) {
      console.error(`[auto-import] Skipped ${result.skipped} already-imported file(s)`);
    }
    const total = db.prepare('SELECT COUNT(*) as c FROM shots').get() as { c: number };
    console.error(`[auto-import] Database contains ${total.c} total shots`);
  } catch (e) {
    console.error(`[auto-import] Warning: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Transport ──────────────────────────────────────────────────────
async function run() {
  autoImport();

  const isSSE = process.argv.includes('--sse');

  if (isSSE) {
    const app = express();
    const sessions = new Map<string, SSEServerTransport>();

    // MCP SSE transport
    app.get('/sse', async (_req: any, res: any) => {
      const transport = new SSEServerTransport('/messages', res);
      sessions.set(transport.sessionId, transport);
      res.on('close', () => sessions.delete(transport.sessionId));
      await server.connect(transport);
    });

    app.post('/messages', async (req: any, res: any) => {
      const sessionId = req.query.sessionId as string;
      const transport = sessions.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send('Unknown session');
      }
    });

    // REST API
    app.use('/api', apiRouter);

    // Health check
    app.get('/health', (_req: any, res: any) => {
      try {
        const shotCount = db.prepare('SELECT COUNT(*) as c FROM shots').get() as { c: number };
        const sessionCount = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
        res.json({ status: 'ok', sessions: sessionCount.c, shots: shotCount.c });
      } catch (e) {
        res.status(500).json({ status: 'error', error: String(e) });
      }
    });

    // Static files (web dashboard)
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4002;
    app.listen(PORT, () => {
      console.error('');
      console.error(`  ⛳ Garmin Golf Server running at http://localhost:${PORT}`);
      console.error(`  📊 Dashboard:  http://localhost:${PORT}`);
      console.error(`  🔌 MCP SSE:    http://localhost:${PORT}/sse`);
      console.error(`  🏥 Health:     http://localhost:${PORT}/health`);
      console.error('');
    });
  } else {
    // Stdio transport (default — used by Gemini CLI, Claude Desktop, etc.)
    const transport = new StdioServerTransport();

    process.stdout.on('error', (err: Error) => {
      console.error(`[stdio] stdout error (${err.message}) — transport likely disconnected`);
    });

    await server.connect(transport);
    console.error('Garmin Golf MCP Server running on stdio');
  }
}

// ─── Crash protection ───────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error(`[FATAL] Uncaught exception: ${err.message}`);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[FATAL] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

run().catch(console.error);
