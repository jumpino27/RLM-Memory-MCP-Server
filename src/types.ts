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

// Edit history entry - tracks changes to a file over time
export interface EditHistoryEntry {
  date: string;
  summary: string;
  memory_id?: string;
}

// File map entry - maps file paths to their descriptions
export interface FileMapEntry {
  path: string;
  description: string;
  last_modified: string;
  keywords: string[];
  edit_history?: EditHistoryEntry[];
  component_type?: string; // e.g., "button", "modal", "form", "api", "service"
  feature_area?: string;   // e.g., "auth", "checkout", "dashboard"
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

// Query result - response to AI agent asking about relevant files
export interface QueryResult {
  relevant_files: Array<{
    path: string;
    description: string;
    relevance_reason: string;
    last_modified: string;
    recent_changes?: string[];
    component_type?: string;
    feature_area?: string;
  }>;
  relevant_memories: Array<{
    id: string;
    summary: string;
    date: string;
    files: string[];
  }>;
  ai_analysis: string;
  suggestions?: string[];
}

// Index verification result
export interface IndexVerificationResult {
  files_indexed: number;
  files_by_type: Record<string, number>;
  files_by_feature: Record<string, string[]>;
  potential_missing: string[];
  confirmation_prompt: string;
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
