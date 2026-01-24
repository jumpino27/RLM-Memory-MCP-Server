/**
 * rlm_index_codebase tool implementation
 * Scans and indexes an existing codebase to build the file map
 */

import * as fs from "fs/promises";
import * as path from "path";
import { type RLMIndexCodebaseInput } from "../schemas/index.js";
import {
  projectExists,
  updateLastAccessed,
  updateFileMap,
  addMemory,
  initializeProject
} from "../services/database.js";
import { generateContent } from "../services/gemini.js";

/**
 * Common words to exclude from keywords
 */
const STOP_WORDS = new Set([
  "this", "that", "these", "those", "with", "from", "into", "about",
  "which", "there", "their", "them", "then", "than", "what", "when",
  "where", "while", "will", "would", "could", "should", "have", "been",
  "being", "does", "doing", "done", "each", "every", "other", "some",
  "for", "and", "the", "are", "not", "but", "can", "all", "any",
  "file", "files", "uses", "used", "using", "provides", "provided",
  "includes", "included", "including", "defines", "defined", "defining",
  "handles", "handled", "handling", "implements", "implemented",
  "creates", "created", "creating", "returns", "returned", "returning",
  "also", "such", "make", "made", "making", "take", "taken", "taking",
  "manages", "managed", "managing", "contains", "contained", "containing",
  "renders", "rendered", "rendering", "allows", "allowed", "allowing",
  "enables", "enabled", "enabling", "perform", "performs", "performing",
  "based", "related", "various", "different", "specific", "general",
  "main", "core", "base", "basic", "simple", "complex", "custom",
  "through", "within", "across", "between", "along", "during",
  "import", "export", "require", "module", "default", "const", "let", "var",
  // Additional common words
  "likely", "typically", "usually", "often", "serves", "serving",
  "central", "primary", "entry", "point", "used", "various",
  "stores", "storing", "stored", "globally", "accessible", "immutable"
]);

/**
 * File type descriptions for common patterns
 */
const FILE_TYPE_HINTS: Record<string, string> = {
  // Components
  "component": "UI component",
  "components": "UI components directory",
  "button": "Button component",
  "form": "Form component",
  "modal": "Modal/dialog component",
  "header": "Header component",
  "footer": "Footer component",
  "sidebar": "Sidebar component",
  "nav": "Navigation component",
  "layout": "Layout component",
  "page": "Page component",
  "view": "View component",

  // Hooks & State
  "hook": "React hook",
  "hooks": "React hooks directory",
  "use": "React hook",
  "context": "React context provider",
  "store": "State store",
  "reducer": "State reducer",
  "action": "State actions",
  "slice": "Redux slice",

  // API & Routes
  "api": "API endpoint/client",
  "route": "Route handler",
  "routes": "Routes directory",
  "router": "Router configuration",
  "controller": "Controller",
  "handler": "Request handler",
  "endpoint": "API endpoint",
  "middleware": "Middleware",

  // Services & Utils
  "service": "Service layer",
  "services": "Services directory",
  "util": "Utility functions",
  "utils": "Utilities directory",
  "helper": "Helper functions",
  "helpers": "Helpers directory",
  "lib": "Library code",

  // Auth & Security
  "auth": "Authentication",
  "login": "Login functionality",
  "logout": "Logout functionality",
  "register": "Registration",
  "session": "Session management",
  "jwt": "JWT token handling",
  "oauth": "OAuth integration",
  "permission": "Permission handling",

  // Database & Models
  "model": "Data model",
  "models": "Models directory",
  "schema": "Database schema",
  "migration": "Database migration",
  "seed": "Database seeder",
  "repository": "Data repository",
  "entity": "Database entity",

  // Config
  "config": "Configuration",
  "env": "Environment configuration",
  "settings": "Settings",
  "constant": "Constants",
  "constants": "Constants directory",

  // Testing
  "test": "Test file",
  "spec": "Test specification",
  "mock": "Mock data/functions",
  "fixture": "Test fixtures",

  // Types
  "type": "Type definitions",
  "types": "Types directory",
  "interface": "Interface definitions",
  "dto": "Data transfer object"
};

/**
 * Extract keywords from file path
 */
function extractKeywordsFromPath(filePath: string): string[] {
  const parts = filePath
    .toLowerCase()
    .replace(/\.[a-z]+$/, "")
    .split(/[/\\]/)
    .filter(p => p && !["src", "lib", "dist", "app", "index"].includes(p));

  const keywords: string[] = [];

  for (const part of parts) {
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
 * Generate description from file path using heuristics
 */
function generateDescriptionFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const fileName = parts[parts.length - 1].replace(/\.[a-z]+$/, "");
  const dirName = parts.length > 1 ? parts[parts.length - 2] : "";

  // Split camelCase/PascalCase
  const fileWords = fileName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[-_\s]+/);

  // Find hints from file/dir name
  const hints: string[] = [];
  for (const word of [...fileWords, dirName.toLowerCase()]) {
    if (FILE_TYPE_HINTS[word]) {
      hints.push(FILE_TYPE_HINTS[word]);
    }
  }

  // Build description
  const readableName = fileWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  if (hints.length > 0) {
    return `${readableName} - ${hints.join(", ")}`;
  }

  // Extension-based hints
  const ext = path.extname(filePath).toLowerCase();
  const extHints: Record<string, string> = {
    ".tsx": "React component",
    ".jsx": "React component",
    ".vue": "Vue component",
    ".svelte": "Svelte component",
    ".test.ts": "Test file",
    ".spec.ts": "Test specification",
    ".test.js": "Test file",
    ".spec.js": "Test specification",
    ".d.ts": "Type definitions",
    ".css": "Stylesheet",
    ".scss": "SCSS stylesheet",
    ".less": "LESS stylesheet",
    ".json": "JSON configuration",
    ".yaml": "YAML configuration",
    ".yml": "YAML configuration"
  };

  if (extHints[ext]) {
    return `${readableName} - ${extHints[ext]}`;
  }

  return `${readableName} in ${dirName || "root"}`;
}

/**
 * Generate description using Gemini AI
 */
async function generateDescriptionWithAI(
  filePath: string,
  content?: string
): Promise<string> {
  const prompt = content
    ? `Analyze this source file and provide a brief 1-2 sentence description of its purpose and main functionality.

File: ${filePath}
Content (first 2000 chars):
${content.slice(0, 2000)}

Return ONLY the description, no formatting or explanations.`
    : `Based on this file path, provide a brief 1-2 sentence description of what this file likely does.

File: ${filePath}

Return ONLY the description, no formatting or explanations.`;

  try {
    const response = await generateContent(prompt);
    return response.trim().slice(0, 500); // Limit description length
  } catch {
    return generateDescriptionFromPath(filePath);
  }
}

/**
 * Check if file extension matches any of the patterns
 */
function matchesIncludePatterns(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const ext = path.extname(normalizedPath).toLowerCase();

  for (const pattern of patterns) {
    // Handle **/*.ext patterns - just check extension
    if (pattern.startsWith("**/")) {
      const patternExt = pattern.slice(3); // Remove **/
      if (patternExt.startsWith("*.")) {
        const targetExt = patternExt.slice(1).toLowerCase(); // Remove * to get .ext
        if (ext === targetExt) {
          return true;
        }
      }
    }
    // Handle *.ext patterns
    else if (pattern.startsWith("*.")) {
      const targetExt = pattern.slice(1).toLowerCase();
      if (ext === targetExt) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if path matches any exclude pattern
 */
function matchesExcludePatterns(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const pathParts = normalizedPath.split("/");

  for (const pattern of patterns) {
    // Handle **/folder/** patterns
    const cleanPattern = pattern.replace(/\*\*/g, "").replace(/\//g, "").toLowerCase();
    if (cleanPattern && pathParts.some(part => part === cleanPattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively scan directory for files
 */
async function scanDirectory(
  dirPath: string,
  includePatterns: string[],
  excludePatterns: string[],
  basePath: string,
  maxFiles: number
): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentPath: string): Promise<void> {
    if (files.length >= maxFiles) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, "/");

        // Check if directory/file is excluded
        if (matchesExcludePatterns(relativePath, excludePatterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Skip common excluded directories by name
          const skipDirs = ["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__", "vendor", "target"];
          if (!skipDirs.includes(entry.name.toLowerCase())) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          // Check if matches include patterns
          if (matchesIncludePatterns(relativePath, includePatterns)) {
            files.push(relativePath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Execute the rlm_index_codebase tool
 */
export async function executeIndexCodebase(
  params: RLMIndexCodebaseInput
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectName = params.project_name;
  const dirPath = params.directory_path;

  // Check if directory exists
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `'${dirPath}' is not a directory`,
            success: false
          }, null, 2)
        }]
      };
    }
  } catch {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Directory not found: '${dirPath}'`,
          success: false
        }, null, 2)
      }]
    };
  }

  // Initialize project if it doesn't exist
  const exists = await projectExists(projectName);
  if (!exists) {
    await initializeProject(projectName, dirPath);
  }

  await updateLastAccessed(projectName);

  // Scan directory for files
  const files = await scanDirectory(
    dirPath,
    params.file_patterns || [],
    params.exclude_patterns || [],
    dirPath,
    params.max_files
  );

  if (files.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: "No matching files found in directory",
          directory: dirPath,
          patterns: params.file_patterns,
          success: false
        }, null, 2)
      }]
    };
  }

  // Process files and generate descriptions
  const fileEntries: Array<{
    path: string;
    description: string;
    keywords: string[];
  }> = [];

  const errors: string[] = [];
  let processedCount = 0;

  // Process in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (relativePath) => {
        try {
          let content: string | undefined;

          // Optionally read file content for better descriptions
          if (params.read_content) {
            try {
              const fullPath = path.join(dirPath, relativePath);
              const fileContent = await fs.readFile(fullPath, "utf-8");
              content = fileContent.slice(0, 3000); // Limit content size
            } catch {
              // Skip files we can't read
            }
          }

          // Generate description
          const description = params.read_content && content
            ? await generateDescriptionWithAI(relativePath, content)
            : await generateDescriptionWithAI(relativePath);

          // Extract keywords
          const pathKeywords = extractKeywordsFromPath(relativePath);
          const descKeywords = description
            .toLowerCase()
            .split(/[\W_]+/)
            .filter(w => w.length > 2 && !STOP_WORDS.has(w));

          const keywords = [...new Set([...pathKeywords, ...descKeywords])].slice(0, 7);

          processedCount++;

          return {
            path: relativePath,
            description,
            keywords
          };
        } catch (error) {
          errors.push(`Failed to process ${relativePath}: ${error}`);
          return null;
        }
      })
    );

    // Add successful results
    for (const result of batchResults) {
      if (result) {
        fileEntries.push(result);
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < files.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Update file map
  const updatedPaths = await updateFileMap(projectName, fileEntries);

  // Create memory entry documenting the indexing
  const memory = await addMemory(projectName, {
    project_id: projectName,
    user_prompt: `Index codebase at ${dirPath}`,
    changes_summary: `Indexed ${fileEntries.length} files from ${dirPath}. File types: ${[...new Set(files.map(f => path.extname(f)))].join(", ")}`,
    files_modified: updatedPaths,
    keywords: ["index", "codebase", "scan", "filemap", "initialization"]
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        message: "Codebase indexed successfully",
        project_name: projectName,
        directory: dirPath,
        files_scanned: files.length,
        files_indexed: fileEntries.length,
        memory_id: memory.id,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        success: true,
        sample_files: fileEntries.slice(0, 5).map(f => ({
          path: f.path,
          description: f.description.slice(0, 100) + (f.description.length > 100 ? "..." : ""),
          keywords: f.keywords
        }))
      }, null, 2)
    }]
  };
}
