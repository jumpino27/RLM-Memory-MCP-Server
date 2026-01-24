#!/usr/bin/env node
/**
 * RLM Memory MCP Server
 *
 * This is the MCP server that AI agents (Claude Code, Codex, Gemini CLI) connect to.
 * It provides tools for persistent memory and semantic file discovery.
 *
 * Tools:
 * - rlm_init: Initialize a project for RLM tracking
 * - rlm_status: Get project status
 * - rlm_recall_memory: Retrieve project context by keywords
 * - rlm_find_files_by_intent: Semantic file discovery
 * - rlm_create_memory: Create memory entry (mandatory after each task)
 * - rlm_list_projects: List all tracked projects
 */

import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

// Load .env from the MCP server directory (not CWD)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initGemini } from "./services/gemini.js";
import { z } from "zod";

// Import tool executors
import { executeRecallMemory } from "./tools/recall-memory.js";
import { executeFindFiles } from "./tools/find-files.js";
import { executeCreateMemory } from "./tools/create-memory.js";
import { executeInit, executeStatus, executeListProjects } from "./tools/init-status.js";
import { executeIndexCodebase } from "./tools/index-codebase.js";

// Import schemas
import {
  RecallMemoryInputSchema,
  FindFilesByIntentInputSchema,
  CreateMemoryInputSchema,
  RLMInitInputSchema,
  RLMStatusInputSchema,
  RLMIndexCodebaseInputSchema
} from "./schemas/index.js";

// Create MCP server instance
const server = new McpServer({
  name: "rlm-memory-mcp-server",
  version: "1.0.0"
});

// Register rlm_init tool
server.registerTool(
  "rlm_init",
  {
    title: "Initialize RLM Project",
    description: `Initialize a new project for RLM memory tracking.

Creates a project folder with memory storage. The project name becomes the folder name.

Args:
  - project_name (string): Name of the project (e.g., "my-awesome-app")
  - working_directory (string): Optional - the actual working directory path for reference

Returns: Project configuration with ID and storage location.

Example: { "project_name": "jumpinotech", "working_directory": "D:\\\\projects\\\\jumpinotech" }`,
    inputSchema: RLMInitInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => executeInit(params)
);

// Register rlm_status tool
server.registerTool(
  "rlm_status",
  {
    title: "Get RLM Project Status",
    description: `Get the status of an RLM project.

Args:
  - project_name (string): Name of the project
  - response_format ('json' | 'markdown'): Output format (default: 'json')

Returns: Project stats, recent memories, and file map summary.`,
    inputSchema: RLMStatusInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => executeStatus(params)
);

// Register rlm_list_projects tool
server.registerTool(
  "rlm_list_projects",
  {
    title: "List All RLM Projects",
    description: `List all projects being tracked by RLM.

Returns: Array of project summaries with names, memory counts, and last accessed times.`,
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => executeListProjects()
);

// Register rlm_recall_memory tool
server.registerTool(
  "rlm_recall_memory",
  {
    title: "Recall Project Memory",
    description: `Retrieves relevant project history and context based on keywords.

**Call this FIRST when starting any task!**

Args:
  - project_name (string): Name of the project
  - keywords (string[]): Keywords extracted from user's prompt (1-20 keywords)
  - limit (number): Max memories to return (default: 10)
  - response_format ('json' | 'markdown'): Output format

Example keywords for "Fix the submit button": ["submit", "button", "form", "ui", "click"]`,
    inputSchema: RecallMemoryInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => executeRecallMemory(params)
);

// Register rlm_find_files_by_intent tool
server.registerTool(
  "rlm_find_files_by_intent",
  {
    title: "Find Files by Intent",
    description: `Semantic file discovery - replaces grep/find commands.

Describe WHAT you want to do and get relevant file paths.

Args:
  - project_name (string): Name of the project
  - user_prompt (string): Natural language description of what you're looking for
  - limit (number): Max files to return (default: 10)

Examples:
  - "I need to fix the submit button color"
  - "Where is user authentication handled?"
  - "Add a new API endpoint"`,
    inputSchema: FindFilesByIntentInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => executeFindFiles(params)
);

// Register rlm_create_memory tool
server.registerTool(
  "rlm_create_memory",
  {
    title: "Create Memory",
    description: `**MANDATORY** - Call this at the end of every task!

Records what was done for future recall and updates the file map.

Args:
  - project_name (string): Name of the project
  - user_prompt (string): Original user request
  - changes_summary (string): Technical summary of changes
  - files_modified (string[]): List of modified file paths
  - keywords (string[]): Optional tags (auto-extracted if not provided)
  - file_descriptions (array): Optional file descriptions for the map

Example:
{
  "project_name": "jumpinotech",
  "user_prompt": "Fix login timeout",
  "changes_summary": "Increased session timeout from 30min to 2hrs",
  "files_modified": ["src/config/auth.ts"],
  "keywords": ["auth", "session", "timeout"]
}`,
    inputSchema: CreateMemoryInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async (params) => executeCreateMemory(params)
);

// Register rlm_index_codebase tool
server.registerTool(
  "rlm_index_codebase",
  {
    title: "Index Existing Codebase",
    description: `Scan and index an existing codebase to build the file map.

Use this when:
- Starting work on an existing project for the first time
- The AI agent asks to "index", "scan", or "map" the codebase
- You need to understand a large codebase structure

Args:
  - project_name (string): Name of the project
  - directory_path (string): Absolute path to scan (e.g., "D:\\\\projects\\\\my-app")
  - file_patterns (string[]): Optional glob patterns to include (default: common source files)
  - exclude_patterns (string[]): Optional glob patterns to exclude (default: node_modules, dist, etc.)
  - max_files (number): Max files to index (default: 100, max: 500)
  - read_content (boolean): Read file content for better descriptions (slower, default: false)

Example:
{
  "project_name": "my-app",
  "directory_path": "D:\\\\projects\\\\my-app",
  "max_files": 200,
  "read_content": true
}`,
    inputSchema: RLMIndexCodebaseInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params) => executeIndexCodebase(params)
);

/**
 * Main entry point - runs the MCP server via stdio
 */
async function main(): Promise<void> {
  // Initialize Gemini API
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error("WARNING: GEMINI_API_KEY not set in .env file. AI features will use fallback methods.");
    console.error(`Looked for .env at: ${envPath}`);
  } else {
    initGemini(geminiKey);
    console.error("Gemini API initialized (key loaded from .env)");
  }

  // Run MCP server via stdio (for AI agents)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RLM Memory MCP Server running via stdio");
}

// Handle errors
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
