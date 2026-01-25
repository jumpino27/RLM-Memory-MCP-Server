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
│   Test all tools via the testing interface                      │
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
│   NEW! Bi-directional communication:                            │
│   Agent asks: "What files for this task?" → MCP answers         │
│   MCP asks: "Is indexing complete?" → Agent confirms            │
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

# Start the UI (for you to view memories and test tools)
npm start
# → Opens http://localhost:3848
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the UI server (for viewing memories + testing) |
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

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.rlm-memory]
command = "node"
args = ["D:\\rlm_memory\\rlm-memory-mcp-server\\dist\\index.js"]
```

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

---

## Tools Available to AI Agents

> **For AI Agent Integration:** See [example_agents.md](./example_agents.md) for concise rules AI agents should follow.

### Core Tools

| Tool | Purpose |
|------|---------|
| `rlm_init` | Initialize a new project for tracking |
| `rlm_status` | Get project statistics |
| `rlm_list_projects` | List all tracked projects |

### Discovery & Search Tools

| Tool | Purpose |
|------|---------|
| `rlm_query` | **PRIMARY** - Ask MCP about relevant files for a user request |
| `rlm_recall_memory` | Retrieve relevant past context by keywords |
| `rlm_find_files_by_intent` | Semantic file search by natural language |

### Indexing & Memory Tools

| Tool | Purpose |
|------|---------|
| `rlm_index_codebase` | Scan & index existing codebase |
| `rlm_verify_index` | Verify indexing is complete (post-index check) |
| `rlm_smart_memory` | **RECOMMENDED** - Create memory with rich metadata |
| `rlm_create_memory` | Basic memory creation (legacy) |

---

## New Tools (v2.0)

### 1. `rlm_query` - Bi-Directional Communication (PRIMARY)

**The main tool for AI agent ↔ MCP communication.**

AI agent asks: "The user wants to fix the login button, what files should I look at?"
MCP's Gemini searches memory + file map + edit history and returns relevant files with context.

```json
{
  "project_name": "my-app",
  "user_request": "The user wants to fix the submit button color on the login form",
  "include_memories": true,
  "include_suggestions": true,
  "max_files": 10
}
```

**Returns:**
- `relevant_files`: Files with descriptions, recent changes, component type, feature area
- `relevant_memories`: Past work related to this request
- `ai_analysis`: Explanation of how to approach the task
- `suggestions`: Tips for the AI agent

### 2. `rlm_smart_memory` - Enhanced Memory Creation (RECOMMENDED)

Creates memory entries with rich metadata. The AI agent provides detailed context, and Gemini:
- Extracts optimal keywords for semantic search
- Classifies files by **component type** (button, form, modal, api-endpoint, etc.)
- Classifies files by **feature area** (auth, checkout, dashboard, etc.)
- Tracks **edit history** for each file

```json
{
  "project_name": "my-app",
  "user_prompt": "Fix the submit button color",
  "changes_context": "Changed the submit button in LoginForm to use the primary theme color instead of hardcoded blue. Also added hover state styling.",
  "files_modified": [
    {
      "path": "src/components/LoginForm.tsx",
      "change_type": "modified",
      "change_summary": "Updated button color to use theme.primary, added hover state"
    }
  ],
  "new_features": ["themed-buttons"],
  "affected_areas": ["auth", "ui"]
}
```

### 3. `rlm_verify_index` - Post-Indexing Verification

After indexing a codebase, this tool asks: **"Is this everything? Are you sure?"**

```json
{
  "project_name": "my-app",
  "expected_features": ["authentication", "payment", "dashboard"],
  "report_format": "summary"
}
```

**Returns:**
- Files indexed grouped by type and feature area
- Potential gaps detected (e.g., "No test files found")
- Confirmation prompt for the AI agent

---

## Enhanced Features

### File Metadata

Each file in the map now includes:
- `component_type`: button, form, modal, hook, service, api-endpoint, etc.
- `feature_area`: auth, checkout, dashboard, user-profile, etc.
- `edit_history`: Array of past changes with dates and summaries

### Smart Semantic Search

The `rlm_find_files_by_intent` tool now:
- Uses component type and feature area to narrow results
- Considers edit history for relevance scoring
- Won't return ALL buttons when you ask for ONE specific button
- Provides reasoning for why files were selected

### Fallback Mode

All tools work without Gemini API (keyword-based fallback):
- `rlm_query`: Uses weighted keyword matching
- `rlm_smart_memory`: Infers types from file paths
- `rlm_find_files_by_intent`: Basic keyword search

---

## Existing Tools Reference

### `rlm_init` - Initialize Project

```json
{
  "project_name": "jumpinotech",
  "working_directory": "D:\\projects\\jumpinotech"
}
```

Creates `projects/jumpinotech/.rlm/` with memory storage.

### `rlm_recall_memory` - Recall Context (CALL FIRST!)

```json
{
  "project_name": "jumpinotech",
  "keywords": ["auth", "login", "session"]
}
```

Returns relevant memories from past work.

### `rlm_find_files_by_intent` - Find Files

```json
{
  "project_name": "jumpinotech",
  "user_prompt": "I need to fix the submit button color"
}
```

Uses AI to find relevant files from the semantic map.

### `rlm_create_memory` - Save Memory (Legacy)

```json
{
  "project_name": "jumpinotech",
  "user_prompt": "Fix login timeout",
  "changes_summary": "Increased session timeout from 30min to 2hrs",
  "files_modified": ["src/config/auth.ts"],
  "keywords": ["auth", "session", "timeout"]
}
```

### `rlm_index_codebase` - Index Existing Codebase

```json
{
  "project_name": "jumpinotech",
  "directory_path": "D:\\projects\\jumpinotech",
  "max_files": 200,
  "read_content": true
}
```

**Now also extracts:** component_type, feature_area, and prompts for verification.

---

## The RLM Workflow

### For New Projects

```
User: "Help me work on this new project"
        │
        ▼
┌──────────────────────────────────────┐
│ 1. rlm_init                          │
│    Initialize project                │
└──────────────────────────────────────┘
        │
        ▼
   Ready for RLM workflow!
```

### For Existing Codebases (First Time)

```
User: "Index this codebase"
        │
        ▼
┌──────────────────────────────────────┐
│ 1. rlm_init + rlm_index_codebase     │
│    Scans directory, builds file map  │
│    with AI-generated descriptions    │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 2. rlm_verify_index                  │
│    MCP asks: "Is this everything?"   │
│    Shows what was indexed + gaps     │
└──────────────────────────────────────┘
        │
        ▼
   Project is ready!
```

### Regular Task Workflow (Recommended)

```
User: "Fix the submit button"
        │
        ▼
┌──────────────────────────────────────┐
│ 1. rlm_query (PRIMARY TOOL)          │
│    "User wants to fix submit button" │
│    → Gets: Relevant files, past      │
│       memories, AI suggestions       │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 2. AI reads & fixes the files        │
│    Using context from rlm_query      │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 3. rlm_smart_memory (MANDATORY!)     │
│    Records changes with rich context │
│    Updates file map with edit history│
└──────────────────────────────────────┘
```

### Legacy Workflow (Still Supported)

```
User: "Fix the submit button"
        │
        ▼
┌──────────────────────────────────────┐
│ 1. rlm_recall_memory                 │
│    keywords: ["submit", "button"]    │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 2. rlm_find_files_by_intent          │
│    "Fix submit button not working"   │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 3. AI reads & fixes the files        │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ 4. rlm_create_memory                 │
│    Records what was done             │
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
│   │   └── gemini.ts      # Gemini AI (semantic search, keywords)
│   ├── tools/
│   │   ├── query.ts           # NEW: rlm_query
│   │   ├── smart-memory.ts    # NEW: rlm_smart_memory
│   │   ├── verify-index.ts    # NEW: rlm_verify_index
│   │   ├── index-codebase.ts  # Enhanced with types
│   │   ├── find-files.ts      # Enhanced semantic search
│   │   ├── recall-memory.ts
│   │   ├── create-memory.ts
│   │   └── init-status.ts
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
- **File map** - See the semantic file index with component types and feature areas
- **Search** - Filter projects by name
- **Tool testing** - Test all MCP tools directly from the UI

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

### What's the difference between rlm_query and rlm_recall_memory?

- `rlm_query`: **Comprehensive** - Searches files + memories + edit history, returns AI analysis and suggestions
- `rlm_recall_memory`: **Simple** - Just searches memories by keywords

### What's the difference between rlm_smart_memory and rlm_create_memory?

- `rlm_smart_memory`: **Rich metadata** - Extracts component types, feature areas, tracks edit history
- `rlm_create_memory`: **Basic** - Just stores the memory entry

---

## License

MIT
