/**
 * Ink-based rich management console for Garmin Golf Analytics.
 * 
 * Provides a terminal UI with:
 *   - Dashboard overview (sessions, shots, clubs)
 *   - CSV import management
 *   - Club stats viewer
 *   - Ollama chat interface
 *   - Feature request viewer
 *   - Server launcher
 */
import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { db } from '../db.js';
import { importDirectory } from '../importer.js';
import { listFeatures } from '../features.js';
import { chat, getOllamaStatus } from '../ollama.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ─── Types ──────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'clubs' | 'sessions' | 'chat' | 'features' | 'import';

interface DashboardData {
  sessions: number;
  shots: number;
  clubs: string[];
  latestSession: string;
  bests: Array<{ club_type: string; best_carry: number; best_total: number }>;
}

interface ClubStat {
  club_type: string;
  shot_count: number;
  avg_carry: number;
  avg_total: number;
  avg_ball_speed: number;
  avg_smash: number;
  avg_spin: number;
  avg_launch: number;
  avg_dispersion: number;
}

// ─── Data Fetchers ──────────────────────────────────────────────────
function getDashboardData(): DashboardData {
  const sessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
  const shots = (db.prepare('SELECT COUNT(*) as c FROM shots').get() as any).c;
  const clubs = (db.prepare('SELECT DISTINCT club_type FROM shots ORDER BY club_type').all() as any[]).map(c => c.club_type);
  const latest = db.prepare('SELECT session_date FROM sessions ORDER BY session_date DESC LIMIT 1').get() as any;
  const bests = db.prepare(`
    SELECT club_type, ROUND(MAX(carry_distance), 1) as best_carry, ROUND(MAX(total_distance), 1) as best_total
    FROM shots GROUP BY club_type ORDER BY best_carry DESC
  `).all() as any[];

  return { sessions, shots, clubs, latestSession: latest?.session_date || '—', bests };
}

function getClubStats(): ClubStat[] {
  return db.prepare(`
    SELECT club_type, COUNT(*) as shot_count,
      ROUND(AVG(carry_distance), 1) as avg_carry,
      ROUND(AVG(total_distance), 1) as avg_total,
      ROUND(AVG(ball_speed), 1) as avg_ball_speed,
      ROUND(AVG(smash_factor), 3) as avg_smash,
      ROUND(AVG(spin_rate), 0) as avg_spin,
      ROUND(AVG(launch_angle), 1) as avg_launch,
      ROUND(AVG(ABS(carry_deviation_distance)), 1) as avg_dispersion
    FROM shots GROUP BY club_type ORDER BY avg_carry DESC
  `).all() as ClubStat[];
}

function getSessionList() {
  return db.prepare(`
    SELECT s.id, s.session_date, s.shot_count, s.player,
      GROUP_CONCAT(DISTINCT sh.club_type) as clubs
    FROM sessions s LEFT JOIN shots sh ON sh.session_id = s.id
    GROUP BY s.id ORDER BY s.session_date DESC
  `).all() as any[];
}

// ─── Components ─────────────────────────────────────────────────────

function Header({ activeTab }: { activeTab: Tab }) {
  const tabs: Array<{ key: Tab; label: string; shortcut: string }> = [
    { key: 'dashboard', label: 'Dashboard', shortcut: '1' },
    { key: 'clubs', label: 'Clubs', shortcut: '2' },
    { key: 'sessions', label: 'Sessions', shortcut: '3' },
    { key: 'chat', label: 'AI Chat', shortcut: '4' },
    { key: 'features', label: 'Features', shortcut: '5' },
    { key: 'import', label: 'Import', shortcut: '6' },
  ];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="green" bold> ⛳ Garmin Golf Analytics </Text>
        <Text color="gray"> — Management Console</Text>
      </Box>
      <Box gap={1} marginTop={1}>
        {tabs.map(t => (
          <Box key={t.key}>
            <Text color={activeTab === t.key ? 'green' : 'gray'} bold={activeTab === t.key}>
              [{t.shortcut}] {t.label}
            </Text>
          </Box>
        ))}
        <Box>
          <Text color="red">[q] Quit</Text>
        </Box>
      </Box>
      <Box>
        <Text color="gray">{'─'.repeat(80)}</Text>
      </Box>
    </Box>
  );
}

function StatBox({ label, value, color = 'green' }: { label: string; value: string | number; color?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={2} paddingY={0} marginRight={1}>
      <Text color={color} bold>{String(value)}</Text>
      <Text color="gray" dimColor>{label}</Text>
    </Box>
  );
}

function DashboardView() {
  const data = getDashboardData();

  return (
    <Box flexDirection="column">
      <Text bold> Your Golf Performance</Text>
      <Box marginTop={1} gap={1}>
        <StatBox label="Sessions" value={data.sessions} />
        <StatBox label="Shots" value={data.shots} />
        <StatBox label="Clubs" value={data.clubs.length} />
        <StatBox label="Latest" value={data.latestSession} color="cyan" />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold> Personal Bests</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={16}><Text color="gray" bold>Club</Text></Box>
            <Box width={14}><Text color="gray" bold>Best Carry</Text></Box>
            <Box width={14}><Text color="gray" bold>Best Total</Text></Box>
          </Box>
          {data.bests.map((b, i) => (
            <Box key={i}>
              <Box width={16}><Text>{b.club_type}</Text></Box>
              <Box width={14}><Text color="green" bold>{b.best_carry}y</Text></Box>
              <Box width={14}><Text>{b.best_total}y</Text></Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function ClubsView() {
  const stats = getClubStats();

  return (
    <Box flexDirection="column">
      <Text bold> Club Performance</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={14}><Text color="gray" bold>Club</Text></Box>
          <Box width={8}><Text color="gray" bold>Shots</Text></Box>
          <Box width={12}><Text color="gray" bold>Carry</Text></Box>
          <Box width={12}><Text color="gray" bold>Total</Text></Box>
          <Box width={12}><Text color="gray" bold>Ball Spd</Text></Box>
          <Box width={10}><Text color="gray" bold>Smash</Text></Box>
          <Box width={10}><Text color="gray" bold>Spin</Text></Box>
          <Box width={10}><Text color="gray" bold>Launch</Text></Box>
          <Box width={12}><Text color="gray" bold>Dispersion</Text></Box>
        </Box>
        {stats.map((s, i) => (
          <Box key={i}>
            <Box width={14}><Text bold>{s.club_type}</Text></Box>
            <Box width={8}><Text color="gray">{s.shot_count}</Text></Box>
            <Box width={12}><Text color="green" bold>{s.avg_carry}y</Text></Box>
            <Box width={12}><Text>{s.avg_total}y</Text></Box>
            <Box width={12}><Text>{s.avg_ball_speed}</Text></Box>
            <Box width={10}><Text>{s.avg_smash}</Text></Box>
            <Box width={10}><Text>{s.avg_spin}</Text></Box>
            <Box width={10}><Text>{s.avg_launch}°</Text></Box>
            <Box width={12}><Text color="yellow">±{s.avg_dispersion}y</Text></Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function SessionsView() {
  const sessions = getSessionList();

  return (
    <Box flexDirection="column">
      <Text bold> Practice Sessions</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={16}><Text color="gray" bold>Date</Text></Box>
          <Box width={10}><Text color="gray" bold>Shots</Text></Box>
          <Box width={12}><Text color="gray" bold>Player</Text></Box>
          <Box width={40}><Text color="gray" bold>Clubs</Text></Box>
        </Box>
        {sessions.map((s: any, i: number) => (
          <Box key={i}>
            <Box width={16}><Text bold>{s.session_date}</Text></Box>
            <Box width={10}><Text color="green">{s.shot_count}</Text></Box>
            <Box width={12}><Text>{s.player}</Text></Box>
            <Box width={40}><Text color="cyan">{s.clubs}</Text></Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ChatView() {
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);

  useEffect(() => {
    getOllamaStatus().then(s => setOllamaOnline(s.available));
  }, []);

  useInput((ch, key) => {
    if (loading) return;

    if (key.return && input.trim()) {
      const userMsg = input.trim();
      setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
      setInput('');
      setLoading(true);

      chat(userMsg).then(response => {
        setMessages(prev => [...prev, { role: 'assistant', text: response }]);
        setLoading(false);
      });
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (ch && !key.ctrl && !key.meta) {
      setInput(prev => prev + ch);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold> Ask Your AI Caddie</Text>
      {ollamaOnline === false && (
        <Text color="yellow"> ⚠ Ollama is offline. Run: ollama serve</Text>
      )}
      {ollamaOnline === true && (
        <Text color="green"> ● Ollama connected</Text>
      )}

      <Box marginTop={1} flexDirection="column" height={15} overflow="hidden">
        {messages.length === 0 && !loading && (
          <Text color="gray" italic> Type a question and press Enter. Try: "What's my average driver carry?"</Text>
        )}
        {messages.slice(-8).map((m, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={m.role === 'user' ? 'green' : 'white'} bold={m.role === 'user'}>
              {m.role === 'user' ? '  You: ' : '  AI:  '}
            </Text>
            <Text wrap="wrap">{m.text.slice(0, 200)}{m.text.length > 200 ? '...' : ''}</Text>
          </Box>
        ))}
        {loading && <Text color="yellow"> ⏳ Thinking...</Text>}
      </Box>

      <Box>
        <Text color="green" bold> {'>'} </Text>
        <Text>{input}<Text color="gray">█</Text></Text>
      </Box>
    </Box>
  );
}

function FeaturesView() {
  const features = listFeatures();

  const statusColor = (s: string) => {
    switch (s) {
      case 'proposed': return 'yellow';
      case 'planned': return 'blue';
      case 'implementing': return 'magenta';
      case 'deployed': return 'green';
      case 'rejected': return 'red';
      default: return 'gray';
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold> Feature Requests</Text>
      <Text color="gray"> Agents and users can propose new analysis tools</Text>
      <Box marginTop={1} flexDirection="column">
        {features.length === 0 && (
          <Text color="gray" italic> No features proposed yet. Use gg_propose_feature from an AI agent, or the web dashboard.</Text>
        )}
        {features.map((f, i) => (
          <Box key={i} marginBottom={1}>
            <Box width={24}><Text bold>{f.feature_name}</Text></Box>
            <Box width={14}><Text color={statusColor(f.status)}>[{f.status}]</Text></Box>
            <Box><Text color="gray">{f.description.slice(0, 50)}</Text></Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ImportView() {
  const [result, setResult] = useState<string | null>(null);

  useInput((_ch, key) => {
    if (key.return) {
      try {
        const r = importDirectory(DATA_DIR);
        if (r.files > 0) {
          setResult(`✅ Imported ${r.files} file(s), ${r.shots} shots`);
        } else if (r.skipped > 0) {
          setResult(`⏭️  All ${r.skipped} file(s) already imported. No new data.`);
        } else {
          setResult('📂 No CSV files found in data/ folder');
        }
      } catch (e) {
        setResult(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  });

  // Count files in data dir
  let csvCount = 0;
  try {
    csvCount = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv')).length;
  } catch { /* empty */ }

  return (
    <Box flexDirection="column">
      <Text bold> Import CSV Data</Text>
      <Box marginTop={1} flexDirection="column">
        <Text> Data folder: <Text color="cyan">{DATA_DIR}</Text></Text>
        <Text> CSV files found: <Text color="green" bold>{csvCount}</Text></Text>
        <Box marginTop={1}>
          <Text color="gray"> Press </Text>
          <Text color="green" bold>Enter</Text>
          <Text color="gray"> to import all CSV files from the data folder</Text>
        </Box>
        {result && (
          <Box marginTop={1}>
            <Text> {result}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={2} flexDirection="column">
        <Text bold color="gray"> To add new sessions:</Text>
        <Text color="gray">  1. Export CSV from Garmin Golf app</Text>
        <Text color="gray">  2. Copy the .csv file to the data/ folder</Text>
        <Text color="gray">  3. Press Enter here to import</Text>
      </Box>
    </Box>
  );
}

// ─── Main App ───────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { exit } = useApp();

  useInput((ch, key) => {
    if (ch === 'q' || (key.ctrl && ch === 'c')) {
      exit();
      return;
    }

    // Tab switching (only when not in chat mode)
    if (tab !== 'chat') {
      switch (ch) {
        case '1': setTab('dashboard'); break;
        case '2': setTab('clubs'); break;
        case '3': setTab('sessions'); break;
        case '4': setTab('chat'); break;
        case '5': setTab('features'); break;
        case '6': setTab('import'); break;
      }
    }

    // Escape from chat back to dashboard
    if (key.escape && tab === 'chat') {
      setTab('dashboard');
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header activeTab={tab} />
      {tab === 'dashboard' && <DashboardView />}
      {tab === 'clubs' && <ClubsView />}
      {tab === 'sessions' && <SessionsView />}
      {tab === 'chat' && <ChatView />}
      {tab === 'features' && <FeaturesView />}
      {tab === 'import' && <ImportView />}
      <Box marginTop={1}>
        <Text color="gray">{'─'.repeat(80)}</Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>
          {tab === 'chat' ? ' Press Esc to return · Type your question and press Enter' : ' Press 1-6 to switch tabs · q to quit'}
        </Text>
      </Box>
    </Box>
  );
}

// ─── Entry Point ────────────────────────────────────────────────────

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Auto-import on startup
try {
  const r = importDirectory(DATA_DIR);
  if (r.files > 0) {
    console.log(`Imported ${r.files} new file(s), ${r.shots} shots`);
  }
} catch { /* silent */ }

// Check for interactive terminal
if (!process.stdin.isTTY) {
  console.log('');
  console.log('  ⛳ Garmin Golf Analytics — Management Console');
  console.log('');
  console.log('  ❌ This console requires an interactive terminal.');
  console.log('     Run this command directly in Windows Terminal, cmd, or PowerShell:');
  console.log('');
  console.log('     npm run console');
  console.log('');
  console.log('  Alternatively, use the web dashboard:');
  console.log('     npm run start:web');
  console.log('');
  process.exit(1);
}

render(<App />);
