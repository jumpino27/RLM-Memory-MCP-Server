/**
 * Database Service
 * Handles all file-based storage operations for the RLM system
 *
 * All project data is stored centrally in: {MCP_ROOT}/projects/{project-name}/.rlm/
 */

import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  PROJECTS_DIR,
  RLM_FOLDER,
  MEMORY_LOG_FILE,
  FILE_MAP_FILE,
  CONFIG_FILE
} from "../constants.js";
import type {
  RLMDatabase,
  MemoryEntry,
  FileMapEntry,
  ProjectConfig,
  ProjectSummary
} from "../types.js";

// Cache for loaded databases
const databaseCache = new Map<string, RLMDatabase>();

/**
 * Ensure the projects directory exists
 */
async function ensureProjectsDir(): Promise<void> {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

/**
 * Sanitize project name for filesystem and consistency
 */
export function sanitizeProjectName(projectName: string): string {
  return projectName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Get the project folder path (inside PROJECTS_DIR)
 */
export function getProjectPath(projectName: string): string {
  const safeName = sanitizeProjectName(projectName);
  return path.join(PROJECTS_DIR, safeName);
}

/**
 * Get the .rlm folder path for a project
 */
export function getRLMPath(projectName: string): string {
  return path.join(getProjectPath(projectName), RLM_FOLDER);
}

/**
 * Check if a project exists
 */
export async function projectExists(projectName: string): Promise<boolean> {
  try {
    const rlmPath = getRLMPath(projectName);
    await fs.access(rlmPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a new project
 */
export async function initializeProject(
  projectName: string,
  originalPath?: string
): Promise<ProjectConfig> {
  await ensureProjectsDir();

  // Always use sanitized name for consistency
  const safeName = sanitizeProjectName(projectName);
  const projectPath = getProjectPath(projectName);
  const rlmPath = getRLMPath(projectName);

  // Create project and .rlm folders
  await fs.mkdir(rlmPath, { recursive: true });

  const projectId = uuidv4();
  const now = new Date().toISOString();

  const config: ProjectConfig = {
    project_id: projectId,
    name: safeName, // Use sanitized name for consistency
    root_path: originalPath || projectPath, // Store original working directory if provided
    created_at: now,
    last_accessed: now
  };

  // Initialize empty files
  await Promise.all([
    fs.writeFile(
      path.join(rlmPath, CONFIG_FILE),
      JSON.stringify(config, null, 2)
    ),
    fs.writeFile(
      path.join(rlmPath, MEMORY_LOG_FILE),
      JSON.stringify([], null, 2)
    ),
    fs.writeFile(
      path.join(rlmPath, FILE_MAP_FILE),
      JSON.stringify([], null, 2)
    )
  ]);

  return config;
}

/**
 * Load the full database for a project
 */
export async function loadDatabase(projectName: string): Promise<RLMDatabase> {
  // Check cache first
  if (databaseCache.has(projectName)) {
    return databaseCache.get(projectName)!;
  }

  const rlmPath = getRLMPath(projectName);

  try {
    const [configData, memoryData, fileMapData] = await Promise.all([
      fs.readFile(path.join(rlmPath, CONFIG_FILE), "utf-8"),
      fs.readFile(path.join(rlmPath, MEMORY_LOG_FILE), "utf-8"),
      fs.readFile(path.join(rlmPath, FILE_MAP_FILE), "utf-8")
    ]);

    const database: RLMDatabase = {
      config: JSON.parse(configData) as ProjectConfig,
      memory_log: JSON.parse(memoryData) as MemoryEntry[],
      file_map: JSON.parse(fileMapData) as FileMapEntry[]
    };

    // Update cache
    databaseCache.set(projectName, database);

    return database;
  } catch (error) {
    throw new Error(`Failed to load RLM database for project '${projectName}': ${error}`);
  }
}

/**
 * Save memory log to disk
 */
export async function saveMemoryLog(
  projectName: string,
  memoryLog: MemoryEntry[]
): Promise<void> {
  const rlmPath = getRLMPath(projectName);
  await fs.writeFile(
    path.join(rlmPath, MEMORY_LOG_FILE),
    JSON.stringify(memoryLog, null, 2)
  );

  // Update cache
  if (databaseCache.has(projectName)) {
    databaseCache.get(projectName)!.memory_log = memoryLog;
  }
}

/**
 * Save file map to disk
 */
export async function saveFileMap(
  projectName: string,
  fileMap: FileMapEntry[]
): Promise<void> {
  const rlmPath = getRLMPath(projectName);
  await fs.writeFile(
    path.join(rlmPath, FILE_MAP_FILE),
    JSON.stringify(fileMap, null, 2)
  );

  // Update cache
  if (databaseCache.has(projectName)) {
    databaseCache.get(projectName)!.file_map = fileMap;
  }
}

/**
 * Update last accessed timestamp
 */
export async function updateLastAccessed(projectName: string): Promise<void> {
  const rlmPath = getRLMPath(projectName);
  const configPath = path.join(rlmPath, CONFIG_FILE);

  try {
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData) as ProjectConfig;
    config.last_accessed = new Date().toISOString();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Update cache
    if (databaseCache.has(projectName)) {
      databaseCache.get(projectName)!.config = config;
    }
  } catch {
    // Ignore errors for timestamp update
  }
}

/**
 * Add a new memory entry
 */
export async function addMemory(
  projectName: string,
  entry: Omit<MemoryEntry, "id" | "timestamp">
): Promise<MemoryEntry> {
  const database = await loadDatabase(projectName);

  const memory: MemoryEntry = {
    ...entry,
    id: `mem_${uuidv4().slice(0, 8)}`,
    timestamp: new Date().toISOString()
  };

  database.memory_log.push(memory);
  await saveMemoryLog(projectName, database.memory_log);

  return memory;
}

/**
 * Search memories by keywords
 */
export async function searchMemories(
  projectName: string,
  keywords: string[],
  limit: number = 10
): Promise<MemoryEntry[]> {
  const database = await loadDatabase(projectName);
  const normalizedKeywords = keywords.map(k => k.toLowerCase());

  // Score each memory by keyword matches
  const scored = database.memory_log.map(memory => {
    const memoryText = [
      ...memory.keywords,
      memory.user_prompt,
      memory.changes_summary
    ].join(" ").toLowerCase();

    const score = normalizedKeywords.reduce((acc, keyword) => {
      return acc + (memoryText.includes(keyword) ? 1 : 0);
    }, 0);

    return { memory, score };
  });

  // Sort by score (descending) and then by timestamp (descending)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.memory.timestamp).getTime() - new Date(a.memory.timestamp).getTime();
  });

  // Return top matches with score > 0
  return scored
    .filter(s => s.score > 0)
    .slice(0, limit)
    .map(s => s.memory);
}

/**
 * Update or add file map entries
 */
export async function updateFileMap(
  projectName: string,
  files: Array<{
    path: string;
    description: string;
    keywords: string[];
  }>
): Promise<string[]> {
  const database = await loadDatabase(projectName);
  const updatedPaths: string[] = [];
  const now = new Date().toISOString();

  for (const file of files) {
    const existingIndex = database.file_map.findIndex(f => f.path === file.path);

    const entry: FileMapEntry = {
      path: file.path,
      description: file.description,
      keywords: file.keywords,
      last_modified: now
    };

    if (existingIndex >= 0) {
      database.file_map[existingIndex] = entry;
    } else {
      database.file_map.push(entry);
    }

    updatedPaths.push(file.path);
  }

  await saveFileMap(projectName, database.file_map);
  return updatedPaths;
}

/**
 * Get all file map entries
 */
export async function getFileMap(projectName: string): Promise<FileMapEntry[]> {
  const database = await loadDatabase(projectName);
  return database.file_map;
}

/**
 * List all projects in the projects directory
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureProjectsDir();

  const projects: ProjectSummary[] = [];

  try {
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectName = entry.name;
        if (await projectExists(projectName)) {
          try {
            const db = await loadDatabase(projectName);
            projects.push({
              project_id: db.config.project_id,
              name: db.config.name,
              root_path: db.config.root_path,
              memory_count: db.memory_log.length,
              file_count: db.file_map.length,
              last_accessed: db.config.last_accessed
            });
          } catch {
            // Skip projects that can't be loaded
          }
        }
      }
    }
  } catch {
    // Projects dir might not exist yet
  }

  // Sort by last accessed
  projects.sort((a, b) =>
    new Date(b.last_accessed).getTime() - new Date(a.last_accessed).getTime()
  );

  return projects;
}

/**
 * Clear cache for a project
 */
export function clearCache(projectName?: string): void {
  if (projectName) {
    databaseCache.delete(projectName);
  } else {
    databaseCache.clear();
  }
}

// Legacy compatibility - these functions now work with project names
export const isProjectInitialized = projectExists;
