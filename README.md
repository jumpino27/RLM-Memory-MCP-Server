# RLM Memory MCP Server

**Persistent memory + semantic file discovery for ANY AI coding agent.**

Works with Claude Code, OpenAI Codex, Gemini CLI, Cursor, Windsurf — anything that speaks [MCP](https://modelcontextprotocol.io).

## What is this?

AI agents forget everything between sessions. This MCP server fixes that:

- 🧠 **Memory** — after every task, the agent records *what* it changed and *why*. Next session, it remembers.
- 🗺️ **File map** — a semantic index of your codebase ("this file is the login form", "this is the checkout API"), so the agent finds the right files **without grepping the whole repo**.
- 🔄 **Bi-directional** — the agent *asks* the MCP ("user wants to fix the submit button — which files?") and the MCP answers with files, history, and suggestions.

The core idea (Recursive Large Model): the agent stays intentionally "blind" to the filesystem and uses the MCP as its eyes and memory — making it faster, cheaper, and more focused.

```
┌────────────────────────────────────────────────────────┐
│  AI Agent (Claude Code, Codex, Gemini CLI, Cursor...)  │
│                                                        │
│  "User wants to fix login" ──► rlm_query               │
│                            ◄── relevant files+history  │
│  [does the work]                                       │
│  "Here's what I changed"   ──► rlm_smart_memory        │
└────────────────────────────────────────────────────────┘
                          │ stdio (MCP)
┌────────────────────────────────────────────────────────┐
│  RLM Memory MCP Server                                 │
│  • JSON storage per project (projects/<name>/.rlm/)    │
│  • AI-powered matching via OpenRouter or Gemini        │
│  • Web UI for you at http://localhost:3848             │
└────────────────────────────────────────────────────────┘
```

---

## Setup in 3 Steps

### 1. Install & build

```bash
git clone https://github.com/jumpino27/RLM-Memory-MCP-Server.git
cd RLM-Memory-MCP-Server
npm install
npm run build
```

### 2. Add an API key

Copy `.env.example` to `.env` and set **one** key:

```env
# Option A (recommended): OpenRouter — one key, any model
# https://openrouter.ai/keys
OPENROUTER_API_KEY="sk-or-..."

# Option B: Google Gemini direct — https://aistudio.google.com/
# GEMINI_API_KEY="..."
```

- With **OpenRouter** the server uses **`google/gemini-3.5-flash`** by default — fast, cheap, near-Pro quality.
- With **Gemini direct** it uses **`gemini-3.5-flash`**.
- **No key at all?** Everything still works using keyword matching (just less smart).

Want a different model? Set `LLM_MODEL` (e.g. `anthropic/claude-haiku-4.5` or `openai/gpt-4o-mini` on OpenRouter). See `.env.example` for all options.

### 3. Connect your AI agent

Replace `C:\\path\\to` with where you cloned the repo.

**Claude Code** (one command):

```bash
claude mcp add rlm-memory -- node C:\\path\\to\\RLM-Memory-MCP-Server\\dist\\index.js
```

**OpenAI Codex CLI** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.rlm-memory]
command = "node"
args = ["C:\\path\\to\\RLM-Memory-MCP-Server\\dist\\index.js"]
```

**Gemini CLI** — add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "rlm-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\RLM-Memory-MCP-Server\\dist\\index.js"]
    }
  }
}
```

**Any other MCP client**: launch `node dist/index.js` over stdio.

> 💡 **Tell your agent how to use it:** copy the rules from [example_agents.md](./example_agents.md) into your agent's instructions file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, …).

---

## The Workflow

**First time on a project** — index it once:

```
rlm_init → rlm_index_codebase → rlm_verify_index
```

**Every task after that** — three steps:

```
1. rlm_query          "User wants X — which files?"   → files + history + tips
2. (agent does the actual work)
3. rlm_smart_memory   "Here's what I changed"         → remembered forever
```

That's it. The more the agent works, the smarter the memory gets.

---

## The Tools

### Daily drivers

| Tool | What it does |
|------|--------------|
| `rlm_query` | ⭐ **Start every task here.** Ask about the user's request → get relevant files, past memories, and suggestions |
| `rlm_smart_memory` | ⭐ **End every task here.** Record changes with rich metadata (component types, feature areas, edit history) |

### Project setup

| Tool | What it does |
|------|--------------|
| `rlm_init` | Register a project for memory tracking |
| `rlm_index_codebase` | Scan a codebase and build the semantic file map |
| `rlm_verify_index` | Post-index check: "Is this everything?" — shows breakdown + gaps |

### Maintenance & extras

| Tool | What it does |
|------|--------------|
| `rlm_manage_sitemap` | Keep the file map in sync when files are deleted/moved/renamed |
| `rlm_status` | Project statistics |
| `rlm_list_projects` | All tracked projects |
| `rlm_recall_memory` | Simple keyword memory search (legacy — prefer `rlm_query`) |
| `rlm_find_files_by_intent` | Semantic file search (legacy — prefer `rlm_query`) |
| `rlm_create_memory` | Basic memory creation (legacy — prefer `rlm_smart_memory`) |

### Example: `rlm_query`

```json
{
  "project_name": "my-app",
  "user_request": "The user wants to fix the submit button color on the login form"
}
```

Returns:

```json
{
  "relevant_files": [
    { "path": "src/components/LoginForm.tsx", "description": "Login form with submit button",
      "component_type": "form", "feature_area": "auth",
      "recent_changes": ["Added hover state to submit button"] }
  ],
  "relevant_memories": [
    { "summary": "Changed submit button to theme primary color", "date": "..." }
  ],
  "ai_analysis": "The submit button lives in LoginForm.tsx and uses theme.ts colors...",
  "suggestions": ["Check theme.ts for the color tokens"]
}
```

### Example: `rlm_smart_memory`

```json
{
  "project_name": "my-app",
  "user_prompt": "Fix the submit button color",
  "changes_context": "Changed the submit button in LoginForm to use the primary theme color instead of hardcoded blue. Added hover state.",
  "files_modified": [
    { "path": "src/components/LoginForm.tsx", "change_type": "modified",
      "change_summary": "Button color now uses theme.primary, added hover state" }
  ],
  "affected_areas": ["auth", "ui"]
}
```

---

## The Web UI (for you, the human)

```bash
npm start   # → http://localhost:3848
```

- Browse all projects, memories, and the semantic file map
- Test every MCP tool from the browser
- Delete stale memories / file entries
- See live AI provider status (e.g. `openrouter · google/gemini-3.5-flash`)

---

## Configuration Reference

All settings live in `.env` (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | OpenRouter key (recommended) — [get one](https://openrouter.ai/keys) |
| `GEMINI_API_KEY` | — | Google Gemini key — [get one](https://aistudio.google.com/) |
| `LLM_PROVIDER` | `auto` | `auto` / `openrouter` / `gemini`. Auto prefers OpenRouter |
| `LLM_MODEL` | `google/gemini-3.5-flash` (OpenRouter) / `gemini-3.5-flash` (direct) | Any model your provider offers |
| `LLM_REASONING_EFFORT` | `low` | `minimal` / `low` / `medium` / `high` — thinking depth for helper calls |
| `LLM_MAX_TOKENS` | `4096` | Max output tokens per call |
| `LLM_TIMEOUT_MS` | `60000` | Per-request timeout |
| `UI_PORT` | `3848` | Web UI port |
| `RLM_DATA_DIR` | `<install dir>/projects` | Where project memories are stored (set it to keep data outside the install tree) |

**Scripts:** `npm start` (web UI) · `npm run mcp` (MCP server directly) · `npm run build` · `npm test` (end-to-end smoke test) · `npm run dev` (UI with auto-reload) · `npm run typecheck`

---

## How data is stored

Everything is plain JSON — no database needed:

```
RLM-Memory-MCP-Server/
└── projects/
    └── my-app/.rlm/
        ├── config.json       # project info
        ├── memory_log.json   # every recorded task
        └── file_map.json     # the semantic file index
```

**Back up** by copying `projects/`. **Inspect** with any text editor or the web UI.

---

## FAQ

**Does this work without an API key?**
Yes — all tools fall back to weighted keyword matching. AI matching is just smarter.

**Why store data centrally instead of in each repo?**
One place to back up, browsable across projects in the UI, no `.rlm` clutter in your repos, survives repo deletion.

**Which agent works best?**
Any MCP-capable agent. The tool descriptions teach the agent how to use them, and [example_agents.md](./example_agents.md) has drop-in instructions.

**`rlm_query` vs `rlm_recall_memory`?**
`rlm_query` searches files + memories + edit history and adds AI analysis. `rlm_recall_memory` only searches memories by keyword. Use `rlm_query`.

**How much does the AI cost?**
Helper calls are small and run at low reasoning effort. With `google/gemini-3.5-flash` ($1.50/M input, $9/M output) typical queries cost fractions of a cent.

---

## Project structure (for contributors)

```
src/
├── index.ts            # MCP server entry (stdio) — registers all tools
├── ui/server.ts        # Web UI (Express) at localhost:3848
├── services/
│   ├── llm.ts          # Multi-provider AI layer (OpenRouter / Gemini + fallbacks)
│   └── database.ts     # JSON file storage
├── tools/              # MCP tool implementations
├── schemas/index.ts    # Zod input validation
├── types.ts            # Shared types
└── constants.ts        # Paths, models, limits
```

## License

MIT
