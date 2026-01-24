/**
 * create_memory tool implementation
 * The "Recursion" step - creates context for future sessions
 */

import { type CreateMemoryInput } from "../schemas/index.js";
import {
  addMemory,
  updateFileMap,
  projectExists,
  updateLastAccessed
} from "../services/database.js";
import { extractKeywords, generateFileDescription } from "../services/gemini.js";

/**
 * Execute the create_memory tool
 */
export async function executeCreateMemory(
  params: CreateMemoryInput
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectName = params.project_name;

  // Check if project exists
  const exists = await projectExists(projectName);
  if (!exists) {
    return {
      content: [{
        type: "text",
        text: `Error: Project '${projectName}' not found. Use rlm_init to create it first.`
      }]
    };
  }

  // Update last accessed
  await updateLastAccessed(projectName);

  // Extract keywords if not provided
  let keywords = params.keywords || [];
  if (keywords.length === 0) {
    const textForKeywords = `${params.user_prompt} ${params.changes_summary}`;
    keywords = await extractKeywords(textForKeywords);
  }

  // Create the memory entry
  const memory = await addMemory(projectName, {
    project_id: projectName,
    user_prompt: params.user_prompt,
    changes_summary: params.changes_summary,
    files_modified: params.files_modified,
    keywords
  });

  // Update file map if descriptions provided
  const updatedPaths: string[] = [];
  if (params.file_descriptions && params.file_descriptions.length > 0) {
    const fileEntries = params.file_descriptions.map(fd => ({
      path: fd.path,
      description: fd.description,
      keywords: extractKeywordsSync(fd.description, fd.path)
    }));

    const paths = await updateFileMap(projectName, fileEntries);
    updatedPaths.push(...paths);
  } else if (params.files_modified.length > 0) {
    // Auto-generate descriptions for modified files
    const fileEntries = await Promise.all(
      params.files_modified.map(async (filePath) => {
        const description = await generateFileDescription(
          filePath,
          params.changes_summary
        );
        return {
          path: filePath,
          description,
          keywords: extractKeywordsSync(description, filePath)
        };
      })
    );

    const paths = await updateFileMap(projectName, fileEntries);
    updatedPaths.push(...paths);
  }

  const textContent = JSON.stringify({
    message: "Memory created successfully",
    id: memory.id,
    timestamp: memory.timestamp,
    project_name: projectName,
    files_updated_in_map: updatedPaths,
    success: true,
    keywords_extracted: keywords
  }, null, 2);

  return {
    content: [{ type: "text", text: textContent }]
  };
}

/**
 * Common words to exclude from keywords (stop words)
 */
const STOP_WORDS = new Set([
  // Articles & pronouns
  "this", "that", "these", "those", "with", "from", "into", "about",
  "which", "there", "their", "them", "then", "than", "what", "when",
  "where", "while", "will", "would", "could", "should", "have", "been",
  "being", "does", "doing", "done", "each", "every", "other", "some",
  "for", "and", "the", "are", "not", "but", "can", "all", "any",
  // Common verbs
  "file", "files", "uses", "used", "using", "provides", "provided",
  "includes", "included", "including", "defines", "defined", "defining",
  "handles", "handled", "handling", "implements", "implemented",
  "creates", "created", "creating", "returns", "returned", "returning",
  "also", "such", "make", "made", "making", "take", "taken", "taking",
  "manages", "managed", "managing", "contains", "contained", "containing",
  "renders", "rendered", "rendering", "allows", "allowed", "allowing",
  "enables", "enabled", "enabling", "perform", "performs", "performing",
  // Generic programming terms (too common to be useful)
  "function", "functions", "method", "methods", "class", "classes",
  "code", "data", "value", "values", "type", "types", "object", "objects",
  "array", "arrays", "string", "strings", "number", "numbers",
  // Filler words
  "based", "related", "various", "different", "specific", "general",
  "main", "core", "base", "basic", "simple", "complex", "custom",
  "ensure", "ensures", "ensuring", "support", "supports", "supporting",
  "through", "within", "across", "between", "along", "during"
]);

/**
 * Technical terms that should be prioritized in keywords
 */
const TECHNICAL_TERMS = new Set([
  // Auth & Security
  "auth", "authentication", "authorization", "jwt", "token", "oauth",
  "session", "login", "logout", "password", "credentials", "security",
  "encrypt", "decrypt", "hash", "cors", "csrf", "permission", "role",
  // API & Web
  "api", "rest", "graphql", "endpoint", "route", "router", "middleware",
  "request", "response", "http", "https", "websocket", "webhook",
  // Database
  "database", "query", "sql", "nosql", "mongo", "postgres", "mysql",
  "redis", "cache", "model", "schema", "migration", "orm",
  // Frontend
  "component", "react", "vue", "angular", "svelte", "hook", "state",
  "props", "render", "template", "style", "css", "html", "dom",
  "form", "input", "button", "modal", "dialog", "menu", "navigation",
  // Backend
  "server", "service", "controller", "handler", "worker", "queue",
  "job", "task", "cron", "scheduler", "logger", "monitor",
  // Testing
  "test", "spec", "mock", "stub", "fixture", "assert", "expect",
  // Config & Utils
  "config", "configuration", "settings", "options", "constants",
  "utils", "utility", "helper", "validator", "validation", "parser",
  // Files & Paths
  "upload", "download", "storage", "file", "image", "media", "asset"
]);

/**
 * Extract meaningful keywords from file path
 */
function extractKeywordsFromPath(filePath: string): string[] {
  // Split path into parts and extract meaningful segments
  const parts = filePath
    .toLowerCase()
    .replace(/\.[a-z]+$/, "") // Remove extension
    .split(/[/\\]/)
    .filter(p => p && p !== "src" && p !== "lib" && p !== "dist");

  const keywords: string[] = [];

  for (const part of parts) {
    // Split camelCase and kebab-case
    const words = part
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .split(/[-_.]/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    keywords.push(...words);
  }

  return [...new Set(keywords)];
}

/**
 * Synchronous keyword extraction with smart filtering
 */
function extractKeywordsSync(text: string, filePath?: string): string[] {
  // Get keywords from file path first (most reliable)
  const pathKeywords = filePath ? extractKeywordsFromPath(filePath) : [];

  // Extract words from text
  const textWords = text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Split camelCase
    .split(/[\W_]+/)
    .filter(word => word.length > 2)
    .filter(word => !STOP_WORDS.has(word));

  // Prioritize technical terms
  const technicalMatches = textWords.filter(w => TECHNICAL_TERMS.has(w));

  // Combine: path keywords first, then technical terms, then other words
  const combined = [
    ...pathKeywords,
    ...technicalMatches,
    ...textWords.filter(w => !technicalMatches.includes(w) && !pathKeywords.includes(w))
  ];

  // Remove duplicates and take top 5-7
  const unique = [...new Set(combined)];
  return unique.slice(0, 7);
}
