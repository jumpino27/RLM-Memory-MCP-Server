/**
 * Type definitions for the RLM Memory MCP Server
 */

// Memory entry stored in the log
export interface MemoryEntry {
  id: string;
  timestamp: string;
  project_id: string;
  user_prompt: string;
  changes_summary: string;
  files_modified: string[];
  keywords: string[];
  embedding?: number[]; // For future vector search
}

// File map entry - maps file paths to their descriptions
export interface FileMapEntry {
  path: string;
  description: string;
  last_modified: string;
  keywords: string[];
}

// Project configuration
export interface ProjectConfig {
  project_id: string;
  name: string;
  root_path: string;
  created_at: string;
  last_accessed: string;
}

// Database structure stored in .rlm folder
export interface RLMDatabase {
  config: ProjectConfig;
  memory_log: MemoryEntry[];
  file_map: FileMapEntry[];
}

// Response formats
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

// Gemini API response types
export interface GeminiGenerateResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

// Tool result types
export interface RecallMemoryResult {
  memories: MemoryEntry[];
  total: number;
  project_id: string;
  keywords_searched: string[];
}

export interface FindFilesResult {
  files: FileMapEntry[];
  total: number;
  query: string;
  ai_reasoning?: string;
}

export interface CreateMemoryResult {
  id: string;
  timestamp: string;
  files_updated_in_map: string[];
  success: boolean;
}

// UI types
export interface ProjectSummary {
  project_id: string;
  name: string;
  root_path: string;
  memory_count: number;
  file_count: number;
  last_accessed: string;
}

// MCP-compatible structured content type
export type StructuredContent = Record<string, unknown>;
