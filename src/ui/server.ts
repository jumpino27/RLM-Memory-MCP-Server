#!/usr/bin/env node
/**
 * RLM Memory UI Server
 *
 * A web interface to view and manage memories across all RLM projects.
 * Run with: npm start (or npm run dev for development)
 */

import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

// Load .env from the MCP server directory (not CWD)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: envPath });

import express from "express";
import {
  listProjects,
  loadDatabase,
  projectExists,
  clearCache
} from "../services/database.js";
import { initGemini } from "../services/gemini.js";
import { UI_PORT, PROJECTS_DIR } from "../constants.js";

const app = express();
app.use(express.json());

// HTML template for the UI
function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RLM Memory Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.6;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid #30363d;
      margin-bottom: 20px;
    }
    h1 { color: #58a6ff; font-size: 1.8em; }
    .subtitle { color: #8b949e; font-size: 0.9em; margin-top: 5px; }
    h2 { color: #8b949e; font-size: 1.2em; margin-bottom: 15px; }
    h3 { color: #c9d1d9; font-size: 1em; margin-bottom: 10px; }
    .grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
      height: calc(100vh - 160px);
    }
    .sidebar {
      background: #161b22;
      border-radius: 8px;
      padding: 15px;
      overflow-y: auto;
    }
    .main {
      background: #161b22;
      border-radius: 8px;
      padding: 20px;
      overflow-y: auto;
    }
    .project-card {
      background: #21262d;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
    }
    .project-card:hover { border-color: #30363d; }
    .project-card.active { border-color: #58a6ff; background: #1f2937; }
    .project-name { font-weight: 600; color: #58a6ff; }
    .project-stats { font-size: 0.85em; color: #8b949e; margin-top: 5px; }
    .project-path { font-size: 0.75em; color: #6e7681; margin-top: 3px; word-break: break-all; }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 1px solid #30363d;
      padding-bottom: 10px;
    }
    .tab {
      background: transparent;
      border: none;
      color: #8b949e;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 6px;
      font-size: 0.9em;
    }
    .tab:hover { background: #21262d; }
    .tab.active { background: #21262d; color: #58a6ff; }
    .memory-card {
      background: #21262d;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      border-left: 3px solid #58a6ff;
    }
    .memory-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .memory-id { font-family: monospace; color: #8b949e; font-size: 0.85em; }
    .memory-date { color: #8b949e; font-size: 0.85em; }
    .memory-prompt { color: #58a6ff; font-weight: 500; margin-bottom: 10px; word-break: break-word; }
    .memory-summary {
      color: #c9d1d9;
      margin-bottom: 10px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
      max-height: 200px;
      overflow-y: auto;
    }
    .memory-files {
      background: #161b22;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .memory-files code {
      display: block;
      font-family: monospace;
      font-size: 0.85em;
      color: #7ee787;
      padding: 2px 0;
    }
    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .keyword {
      background: #30363d;
      color: #8b949e;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
    }
    .file-card {
      background: #21262d;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .file-path {
      font-family: monospace;
      color: #7ee787;
      font-size: 0.9em;
      margin-bottom: 5px;
    }
    .file-desc { color: #8b949e; font-size: 0.9em; }
    .search-box {
      width: 100%;
      padding: 10px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      margin-bottom: 15px;
    }
    .search-box:focus { outline: none; border-color: #58a6ff; }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #8b949e;
    }
    .stats-row {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
    }
    .stat-box {
      background: #21262d;
      border-radius: 8px;
      padding: 15px 20px;
      flex: 1;
    }
    .stat-value { font-size: 2em; font-weight: 600; color: #58a6ff; }
    .stat-label { color: #8b949e; font-size: 0.9em; }
    .refresh-btn {
      background: #238636;
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9em;
    }
    .refresh-btn:hover { background: #2ea043; }
    .auto-refresh {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #8b949e;
      font-size: 0.85em;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #238636;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>RLM Memory Browser</h1>
        <div class="subtitle">Projects stored in: ${PROJECTS_DIR.replace(/\\/g, "/")}</div>
      </div>
      <div class="header-right">
        <div class="auto-refresh">
          <span class="status-dot"></span>
          <span>Auto-refresh: 5s</span>
        </div>
        <button class="refresh-btn" onclick="loadProjects()">Refresh Now</button>
      </div>
    </header>
    <div class="grid">
      <div class="sidebar">
        <h2>Projects</h2>
        <input type="text" class="search-box" placeholder="Search projects..." id="projectSearch" oninput="filterProjects()">
        <div id="projectList"></div>
      </div>
      <div class="main">
        <div id="projectContent">
          <div class="empty-state">
            <h3>Select a project to view its memories</h3>
            <p>Projects are created when AI agents use rlm_init</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let projects = [];
    let currentProject = null;
    let currentTab = 'memories';
    let autoRefreshInterval = null;

    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        projects = await res.json();
        renderProjects();

        // If we have a current project, refresh its data too
        if (currentProject) {
          const updated = projects.find(p => p.name === currentProject.config.name);
          if (updated) {
            await selectProject(updated.name);
          }
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      }
    }

    function filterProjects() {
      const search = document.getElementById('projectSearch').value.toLowerCase();
      const filtered = projects.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.working_directory.toLowerCase().includes(search)
      );
      renderProjects(filtered);
    }

    function renderProjects(list = projects) {
      const container = document.getElementById('projectList');
      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No projects found</div>';
        return;
      }
      container.innerHTML = list.map(p => \`
        <div class="project-card \${currentProject?.config?.name === p.name ? 'active' : ''}"
             onclick="selectProject('\${p.name.replace(/'/g, "\\\\'")}')">
          <div class="project-name">\${escapeHtml(p.name)}</div>
          <div class="project-stats">\${p.memory_count} memories, \${p.file_count} files</div>
          <div class="project-path">\${escapeHtml(p.working_directory)}</div>
        </div>
      \`).join('');
    }

    async function selectProject(projectName) {
      try {
        const res = await fetch(\`/api/project?name=\${encodeURIComponent(projectName)}\`);
        currentProject = await res.json();
        renderProjectContent();
        renderProjects();
      } catch (err) {
        console.error('Failed to load project:', err);
      }
    }

    function switchTab(tab) {
      currentTab = tab;
      renderProjectContent();
    }

    function renderProjectContent() {
      if (!currentProject) return;

      const container = document.getElementById('projectContent');
      const memories = currentProject.memory_log || [];
      const files = currentProject.file_map || [];
      const config = currentProject.config || {};

      container.innerHTML = \`
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-value">\${memories.length}</div>
            <div class="stat-label">Memories</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">\${files.length}</div>
            <div class="stat-label">Files Mapped</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">\${new Date(config.created_at).toLocaleDateString()}</div>
            <div class="stat-label">Created</div>
          </div>
        </div>

        <div class="tabs">
          <button class="tab \${currentTab === 'memories' ? 'active' : ''}" onclick="switchTab('memories')">
            Memories (\${memories.length})
          </button>
          <button class="tab \${currentTab === 'files' ? 'active' : ''}" onclick="switchTab('files')">
            File Map (\${files.length})
          </button>
        </div>

        <div id="tabContent"></div>
      \`;

      const tabContent = document.getElementById('tabContent');

      if (currentTab === 'memories') {
        if (memories.length === 0) {
          tabContent.innerHTML = '<div class="empty-state">No memories yet. AI agents will create them!</div>';
          return;
        }

        const sorted = [...memories].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        tabContent.innerHTML = sorted.map(m => \`
          <div class="memory-card">
            <div class="memory-header">
              <span class="memory-id">\${escapeHtml(m.id)}</span>
              <span class="memory-date">\${new Date(m.timestamp).toLocaleString()}</span>
            </div>
            <div class="memory-prompt">\${escapeHtml(m.user_prompt)}</div>
            <div class="memory-summary">\${escapeHtml(m.changes_summary)}</div>
            \${m.files_modified.length > 0 ? \`
              <div class="memory-files">
                <strong>Files Modified:</strong>
                \${m.files_modified.map(f => \`<code>\${escapeHtml(f)}</code>\`).join('')}
              </div>
            \` : ''}
            <div class="keywords">
              \${m.keywords.map(k => \`<span class="keyword">\${escapeHtml(k)}</span>\`).join('')}
            </div>
          </div>
        \`).join('');
      } else {
        if (files.length === 0) {
          tabContent.innerHTML = '<div class="empty-state">No files mapped yet. They are added via rlm_create_memory.</div>';
          return;
        }

        tabContent.innerHTML = files.map(f => \`
          <div class="file-card">
            <div class="file-path">\${escapeHtml(f.path)}</div>
            <div class="file-desc">\${escapeHtml(f.description)}</div>
            <div class="keywords" style="margin-top: 8px;">
              \${f.keywords.map(k => \`<span class="keyword">\${escapeHtml(k)}</span>\`).join('')}
            </div>
          </div>
        \`).join('');
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // Initial load
    loadProjects();

    // Auto-refresh every 5 seconds
    autoRefreshInterval = setInterval(loadProjects, 5000);
  </script>
</body>
</html>`;
}

// Routes
app.get("/", (_req, res) => {
  res.type("html").send(getHTML());
});

app.get("/api/projects", async (_req, res) => {
  try {
    clearCache(); // Clear cache to get fresh data
    const projects = await listProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/project", async (req, res) => {
  try {
    const projectName = req.query.name as string;
    if (!projectName) {
      return res.status(400).json({ error: "name parameter required" });
    }

    const exists = await projectExists(projectName);
    if (!exists) {
      return res.status(404).json({ error: "Project not found" });
    }

    clearCache(projectName); // Clear cache for this project
    const db = await loadDatabase(projectName);
    res.json(db);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Start server
const port = parseInt(process.env.UI_PORT || String(UI_PORT));

// Initialize Gemini if available (for any future AI features in UI)
const geminiKey = process.env.GEMINI_API_KEY;
if (geminiKey) {
  initGemini(geminiKey);
}

app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    RLM Memory Browser                          ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║   Open in your browser:                                        ║
║   http://localhost:${port}                                        ║
║                                                                ║
║   Projects directory:                                          ║
║   ${PROJECTS_DIR}
║                                                                ║
║   Auto-refresh: Every 5 seconds                                ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
});
