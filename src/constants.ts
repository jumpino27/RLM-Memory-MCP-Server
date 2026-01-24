/**
 * Constants for the RLM Memory MCP Server
 */

import * as path from "path";
import { fileURLToPath } from "url";

// Get the directory where this MCP server is installed
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for all project data (inside the MCP server directory)
export const MCP_ROOT = path.resolve(__dirname, "..");
export const PROJECTS_DIR = path.join(MCP_ROOT, "projects");

// Gemini API configuration
export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_MODEL = "gemini-3-flash-preview";

// Database folder name (inside each project folder in PROJECTS_DIR)
export const RLM_FOLDER = ".rlm";
export const MEMORY_LOG_FILE = "memory_log.json";
export const FILE_MAP_FILE = "file_map.json";
export const CONFIG_FILE = "config.json";

// Limits
export const CHARACTER_LIMIT = 25000;
export const MAX_MEMORIES_RETURN = 50;
export const MAX_FILES_RETURN = 100;
export const DEFAULT_MEMORY_LIMIT = 10;

// Server configuration
export const DEFAULT_PORT = 3847;
export const UI_PORT = 3848;

// Keywords extraction prompt
export const KEYWORDS_EXTRACTION_PROMPT = `Extract 3-7 relevant keywords from the following text.
Return ONLY a JSON array of lowercase strings, no explanations.
Example output: ["authentication", "api", "jwt", "login"]

Text: `;

// File intent matching prompt
export const FILE_INTENT_PROMPT = `You are an AI assistant helping to find relevant files in a codebase.
Given the user's intent and a list of files with descriptions, return the most relevant file paths.

User Intent: {intent}

Available Files:
{files}

Return ONLY a JSON object with this structure:
{
  "files": ["path1", "path2"],
  "reasoning": "Brief explanation of why these files match"
}

Select files that best match the user's intent. Be precise and only include truly relevant files.`;
