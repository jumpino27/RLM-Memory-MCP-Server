# RLM Memory MCP Server

**Recursive Large Model (RLM) Memory System** - A Model Context Protocol (MCP) server that provides AI agents with persistent memory and semantic file discovery.

The core philosophy: The AI Agent is **intentionally blinded** to the file system. Instead of using `ls`, `grep`, `find`, or `dir`, the AI relies on the MCP to be its eyes and memory.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOU (Developer)                             │
│                                                                 │
│   npm start → Opens UI at http://localhost:3848                 │
│   View all projects and memories in real-time                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   projects/ directory                           │
│   rlm-memory-mcp-server/projects/                               │
│   ├── jumpinotech/.rlm/                                         │
│   ├── my-app/.rlm/                                              │
│   └── another-project/.rlm/                                     │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                  AI Agents (Claude Code, Codex, etc)            │
│                                                                 │
│   Call MCP tools via stdio:                                     │
│   rlm_init → rlm_recall_memory → rlm_find_files → rlm_create    │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd rlm-memory-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Create .env file with your Gemini API key
echo 'GEMINI_API_KEY=your-key-here' > .env

# Start the UI (for you to view memories)
npm start
# → Opens http://localhost:3848
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the UI server (for viewing memories) |
| `npm run dev` | Start UI in development mode with auto-reload |
| `npm run mcp` | Run MCP server directly (for testing) |
| `npm run build` | Build TypeScript to JavaScript |

## Environment Variables

Create a `.env` file:

```env
# Required for AI features
GEMINI_API_KEY=your-gemini-api-key

# Optional
UI_PORT=3848
```

Get a Gemini API key at [Google AI Studio](https://aistudio.google.com/).

---

## MCP Configuration for AI Agents

### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "rlm-memory": {
      "command": "node",
      "args": ["D:\\rlm_memory\\rlm-memory-mcp-server\\dist\\index.js"]
    }
  }
}
```

Or use CLI:
```bash
claude mcp add rlm-memory -- node D:\\rlm_memory\\rlm-memory-mcp-server\\dist\\index.js
```

> **Note:** The Gemini API key is loaded from the `.env` file in the MCP server directory, so you don't need to specify it in the config.

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.rlm-memory]
command = "node"
args = ["D:\\rlm_memory\\rlm-memory-mcp-server\\dist\\index.js"]
```

> **Note:** The Gemini API key is loaded from the `.env` file in the MCP server directory.

### Gemini CLI

Add to `~/.gemini/mcp.json`:

```json
{
  "servers": {
    "rlm-memory": {
      "command": "node",
      "args": ["D:\\rlm_memory\\rlm-memory-mcp-server\\dist\\index.js"]
    }
  }
}
```

> **Note:** The Gemini API key is loaded from the `.env` file in the MCP server directory.

---

## Tools Available to AI Agents

> **For AI Agent Integration:** See [example_agents.md](./example_agents.md) for concise rules AI agents should follow.

| Tool | Purpose |
|------|---------|
| `rlm_init` | Initialize a new project for tracking |
| `rlm_index_codebase` | Scan & index existing codebase (use first on large projects) |
| `rlm_recall_memory` | Retrieve relevant past context by keywords |
| `rlm_find_files_by_intent` | Semantic file search by natural language |
| `rlm_create_memory` | **MANDATORY** - Record work done after each task |
| `rlm_status` | Get project statistics |
| `rlm_list_projects` | List all tracked projects |

---

### 1. `rlm_init` - Initialize Project

```json
{
  "project_name": "jumpinotech",
  "working_directory": "D:\\projects\\jumpinotech"
}
```

Creates `projects/jumpinotech/.rlm/` with memory storage.

### 2. `rlm_recall_memory` - Recall Context (CALL FIRST!)

```json
{
  "project_name": "jumpinotech",
  "keywords": ["auth", "login", "session"]
}
```

Returns relevant memories from past work.

### 3. `rlm_find_files_by_intent` - Find Files

```json
{
  "project_name": "jumpinotech",
  "user_prompt": "I need to fix the submit button color"
}
```

Uses AI to find relevant files from the semantic map.

### 4. `rlm_create_memory` - Save Memory (MANDATORY!)

```json
{
  "project_name": "jumpinotech",
  "user_prompt": "Fix login timeout",
  "changes_summary": "Increased session timeout from 30min to 2hrs",
  "files_modified": ["src/config/auth.ts"],
  "keywords": ["auth", "session", "timeout"]
}
```

### 5. `rlm_list_projects` - List All Projects

Returns all tracked projects.

### 6. `rlm_status` - Get Project Status

```json
{
  "project_name": "jumpinotech"
}
```

### 7. `rlm_index_codebase` - Index Existing Codebase (NEW!)

Scan and index an existing codebase to build the file map. Use this when starting work on a large existing project.

```json
{
  "project_name": "jumpinotech",
  "directory_path": "D:\\projects\\jumpinotech",
  "max_files": 200,
  "read_content": true
}
```

**Parameters:**
- `project_name`: Name of the project
- `directory_path`: Absolute path to scan
- `file_patterns`: Optional - glob patterns to include (default: common source files)
- `exclude_patterns`: Optional - patterns to exclude (default: node_modules, dist, etc.)
- `max_files`: Max files to index (default: 100, max: 500)
- `read_content`: Read file content for better AI descriptions (slower but more accurate)

**Example usage:**
- AI agent says "please index this project" → calls `rlm_index_codebase`
- Starting work on a new codebase → index it first for better file discovery

---

## The RLM Workflow

### For Existing Codebases (First Time)

```
User: "Help me work on this project" or "Index this codebase"
        │
        ▼
┌──────────────────────────────────────┐
│ 1. rlm_init + rlm_index_codebase     │
│    Scans directory, builds file map  │
│    with AI-generated descriptions    │
└──────────────────────────────────────┘
        │
        ▼
   Project is now ready for RLM workflow!
```

### Regular Workflow

```
User: "Fix the submit button"
        │
        ▼
┌──────────────────────────────────────┐
│ 1. rlm_recall_memory                 │
│    keywords: ["submit", "button"]    │
│    → Gets: "Last week moved forms    │
│       to FormContext.tsx"            │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 2. rlm_find_files_by_intent          │
│    "Fix submit button not working"   │
│    → Returns: SubmitButton.tsx,      │
│       FormContext.tsx                │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 3. AI reads & fixes the files        │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 4. rlm_create_memory (MANDATORY!)    │
│    Records what was done for next    │
│    time                              │
└──────────────────────────────────────┘
```

---

## Project Structure

```
rlm-memory-mcp-server/
├── src/
│   ├── index.ts           # MCP server (for AI agents via stdio)
│   ├── ui/
│   │   └── server.ts      # Web UI (for you at localhost:3848)
│   ├── services/
│   │   ├── database.ts    # File-based storage
│   │   └── gemini.ts      # Gemini 3 Flash Preview AI
│   ├── tools/             # MCP tool implementations
│   └── schemas/           # Zod validation
├── projects/              # All project data stored here
│   ├── jumpinotech/.rlm/
│   └── my-app/.rlm/
├── dist/                  # Built JavaScript
├── .env                   # Your API keys
└── package.json
```

---

## Web UI Features

Open `http://localhost:3848` after running `npm start`:

- **Real-time updates** - Auto-refreshes every 5 seconds
- **Project browser** - See all tracked projects
- **Memory viewer** - View all memories with timestamps
- **File map** - See the semantic file index
- **Search** - Filter projects by name

---

## FAQ

### Why not store data in each project folder?

Centralized storage in `projects/` means:
- One place to back up all AI memories
- Easy to view across all projects in the UI
- No cluttering project repos with `.rlm` folders
- Works even if you delete project folders

### Can I use this without Gemini API?

Yes! Falls back to keyword matching. AI features just won't be as smart.

### How do I back up my memories?

Just copy the `projects/` folder.

---

## License

MIT
