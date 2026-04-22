# ⛳ Garmin Golf Analytics

AI-powered driving range analytics for your Garmin Approach R10/R50 data.

![Dashboard](https://img.shields.io/badge/Web_Dashboard-✅-10b981) ![MCP](https://img.shields.io/badge/MCP_Server-✅-3b82f6) ![Ollama](https://img.shields.io/badge/AI_Chat-Optional-f59e0b)

---

## What This Does

- **Web Dashboard** — Beautiful interface to view your driving range sessions, club stats, and personal bests
- **AI Chat** — Ask questions about your game in plain English (powered by Ollama, optional)
- **MCP Server** — Lets AI assistants (Claude, Gemini) analyze your golf data using smart tools
- **CSV Upload** — Drag-and-drop your Garmin Golf exports to add new sessions

---

## 🚀 Quick Start (5 minutes)

### Prerequisites

You need **Node.js** installed on your computer.

👉 Download from [nodejs.org](https://nodejs.org) — click the **LTS** button and install it.

### Setup

1. **Unzip** this folder somewhere on your computer
2. **Double-click `setup.bat`** — this installs everything and builds the project
3. **Double-click `start.bat`** — this launches the web dashboard

The dashboard opens automatically at **http://localhost:4002**

### Adding Your Data

**Option 1 — File Drop:**
Put your Garmin Golf CSV export files in the `data/` folder, then restart the server.

**Option 2 — Web Upload:**
Click the **Upload** tab in the dashboard and drag-and-drop your CSV files.

### How to Export from Garmin Golf

1. Open the **Garmin Golf** app on your phone
2. Go to **Driving Range** → select a session
3. Tap the **share/export icon** (↑)
4. Choose **"Export as CSV"**
5. Send the file to your computer (email, cloud drive, etc.)

---

## 🤖 AI Chat (Optional)

The "Ask AI" tab lets you ask natural language questions about your game. This requires **Ollama** running locally.

### Setup Ollama

1. Download from [ollama.com](https://ollama.com)
2. Install and run it
3. Open a terminal and run: `ollama pull gemma3:12b`
4. The green dot in the dashboard nav bar will show "AI: Online" when ready

### Example Questions

- "What's my average driver carry distance?"
- "How has my 3 Hybrid improved over time?"
- "What should I work on to hit farther?"
- "Compare my attack angle between irons and driver"

> **Note:** The AI chat is completely optional. All other features work without it.

---

## 🔌 Using with Claude Desktop

Add this to your Claude Desktop MCP config file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "garmin-golf": {
      "command": "node",
      "args": ["C:/path/to/gg-mcp-server/dist/server.js"]
    }
  }
}
```

⚠️ Replace `C:/path/to/gg-mcp-server` with the actual path where you unzipped the folder.

After adding this, restart Claude Desktop. You can then ask Claude things like:
- "Show me my club stats"
- "What's my best driver shot?"
- "Compare my last two practice sessions"

### Available MCP Tools

| Tool | What It Does |
|------|-------------|
| `gg_import_data` | Import CSV files from the data/ folder |
| `gg_list_sessions` | List all practice sessions |
| `gg_session_detail` | Shot-by-shot data for a session |
| `gg_club_stats` | Performance stats per club |
| `gg_query_shots` | Search/filter shots by any criteria |
| `gg_trend_analysis` | Track improvement over time |
| `gg_compare_sessions` | Compare two sessions side-by-side |
| `gg_dispersion` | Accuracy/consistency analysis |
| `gg_best_shots` | Personal best shots by any metric |
| `gg_propose_feature` | Suggest a new analysis tool |
| `gg_list_features` | View proposed features |

---

## 🔌 Using with Gemini CLI

Add to your `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "garmin-golf": {
      "command": "node",
      "args": ["C:/path/to/gg-mcp-server/dist/server.js"]
    }
  }
}
```

⚠️ Replace `C:/path/to/gg-mcp-server` with the actual path.

Then in any Gemini CLI session, the golf tools are available automatically.

---

## 📂 Project Structure

```
gg-mcp-server/
├── data/              ← Drop your Garmin CSV files here
├── public/            ← Web dashboard (HTML/CSS/JS)
├── src/               ← Server source code (TypeScript)
│   ├── server.ts      ← Main entry point
│   ├── db.ts          ← SQLite database
│   ├── importer.ts    ← CSV parser
│   ├── tools.ts       ← MCP tools (9 golf analysis tools)
│   ├── feature_tools.ts ← Feature request MCP tools
│   ├── api.ts         ← REST API for web dashboard
│   ├── ollama.ts      ← AI chat integration
│   └── features.ts    ← Feature request system
├── setup.bat          ← One-click setup
├── start.bat          ← One-click launch
└── README.md          ← This file
```

---

## 🏌️ Feature Requests

AI agents can propose new analysis tools! When an agent identifies a gap (e.g., "there's no tempo analysis tool"), it can call `gg_propose_feature` to suggest one.

You can also propose features through the web dashboard's **Features** tab.

If you have Ollama running, you can click "Auto-Implement" to generate the tool code automatically.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `setup.bat` says "Node.js not installed" | Download from [nodejs.org](https://nodejs.org) and install the LTS version |
| Dashboard shows no data | Put CSV files in the `data/` folder or use the Upload tab |
| AI Chat says "Ollama not running" | Install [Ollama](https://ollama.com), then run `ollama pull gemma3:12b` |
| Port 4002 is already in use | Set a different port: `set PORT=4003 && node dist/server.js --sse` |
| Claude/Gemini can't find the server | Make sure the path in the config file is correct (use forward slashes) |
