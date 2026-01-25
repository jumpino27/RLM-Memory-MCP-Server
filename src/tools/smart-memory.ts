/**
 * rlm_smart_memory tool implementation
 *
 * Enhanced memory creation with better context understanding.
 * The AI agent provides detailed change context, and Gemini generates:
 * - Better keywords for semantic search
 * - Component type and feature area classification
 * - Edit history tracking
 */

import { type RLMSmartMemoryInput } from "../schemas/index.js";
import {
  loadDatabase,
  projectExists,
  updateLastAccessed,
  saveMemoryLog,
  saveFileMap
} from "../services/database.js";
import { generateContent } from "../services/gemini.js";
import { v4 as uuidv4 } from "uuid";
import type { MemoryEntry, FileMapEntry, EditHistoryEntry } from "../types.js";

/**
 * Use Gemini to extract rich metadata from change context
 */
async function extractRichMetadata(
  userPrompt: string,
  changesContext: string,
  filesModified: Array<{ path: string; change_type: string; change_summary: string }>
): Promise<{
  keywords: string[];
  fileMetadata: Record<string, {
    description: string;
    component_type: string;
    feature_area: string;
    keywords: string[];
  }>;
  memorySummary: string;
}> {
  const filesList = filesModified.map(f =>
    `- ${f.path} (${f.change_type}): ${f.change_summary}`
  ).join("\n");

  const prompt = `Analyze this code change and extract metadata for semantic search and future recall.

USER REQUEST: "${userPrompt}"

CHANGES MADE: "${changesContext}"

FILES MODIFIED:
${filesList}

Based on this information, extract:
1. Keywords for semantic search (technical terms, features, concepts)
2. For each file, determine:
   - Brief description of what it does
   - Component type (e.g., "button", "form", "modal", "api-endpoint", "service", "hook", "util", "config")
   - Feature area (e.g., "auth", "checkout", "dashboard", "user-profile", "settings")
   - File-specific keywords

Return ONLY a JSON object with this exact structure:
{
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "memory_summary": "Concise summary of what was accomplished",
  "files": {
    "path/to/file.ts": {
      "description": "Brief description",
      "component_type": "type",
      "feature_area": "area",
      "keywords": ["kw1", "kw2"]
    }
  }
}

IMPORTANT:
- Keywords should be specific and useful for future search
- Avoid generic words like "file", "code", "function", "this", "that"
- Component types should be specific: "submit-button" is better than "button"
- Feature areas should reflect the business domain`;

  try {
    const response = await generateContent(prompt);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        keywords: parsed.keywords || [],
        fileMetadata: parsed.files || {},
        memorySummary: parsed.memory_summary || changesContext.slice(0, 200)
      };
    }
  } catch (error) {
    // Fallback
  }

  // Fallback: extract keywords from text
  const allText = `${userPrompt} ${changesContext} ${filesModified.map(f => f.change_summary).join(" ")}`;
  const words = allText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const uniqueWords = [...new Set(words)].slice(0, 10);

  const fileMetadata: Record<string, any> = {};
  for (const file of filesModified) {
    const fileName = file.path.split(/[/\\]/).pop() || file.path;
    fileMetadata[file.path] = {
      description: `${file.change_type}: ${file.change_summary}`,
      component_type: inferComponentType(file.path),
      feature_area: inferFeatureArea(file.path),
      keywords: extractKeywordsFromPath(file.path)
    };
  }

  return {
    keywords: uniqueWords,
    fileMetadata,
    memorySummary: changesContext.slice(0, 200)
  };
}

/**
 * Infer component type from file path
 */
function inferComponentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes("button")) return "button";
  if (lowerPath.includes("form")) return "form";
  if (lowerPath.includes("modal") || lowerPath.includes("dialog")) return "modal";
  if (lowerPath.includes("hook") || lowerPath.startsWith("use")) return "hook";
  if (lowerPath.includes("service")) return "service";
  if (lowerPath.includes("api") || lowerPath.includes("endpoint")) return "api-endpoint";
  if (lowerPath.includes("util") || lowerPath.includes("helper")) return "utility";
  if (lowerPath.includes("config") || lowerPath.includes("constant")) return "config";
  if (lowerPath.includes("context") || lowerPath.includes("provider")) return "context";
  if (lowerPath.includes("store") || lowerPath.includes("slice")) return "state";
  if (lowerPath.includes("component")) return "component";
  if (lowerPath.includes("page") || lowerPath.includes("view")) return "page";
  if (lowerPath.includes("layout")) return "layout";
  if (lowerPath.includes("test") || lowerPath.includes("spec")) return "test";

  return "unknown";
}

/**
 * Infer feature area from file path
 */
function inferFeatureArea(filePath: string): string {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes("auth") || lowerPath.includes("login") || lowerPath.includes("signup")) return "auth";
  if (lowerPath.includes("checkout") || lowerPath.includes("cart") || lowerPath.includes("payment")) return "checkout";
  if (lowerPath.includes("dashboard")) return "dashboard";
  if (lowerPath.includes("profile") || lowerPath.includes("account")) return "user-profile";
  if (lowerPath.includes("setting")) return "settings";
  if (lowerPath.includes("admin")) return "admin";
  if (lowerPath.includes("api")) return "api";
  if (lowerPath.includes("shared") || lowerPath.includes("common")) return "shared";
  if (lowerPath.includes("nav") || lowerPath.includes("header") || lowerPath.includes("footer")) return "navigation";

  // Try to extract from directory structure
  const parts = filePath.split(/[/\\]/);
  for (const part of parts) {
    if (part && !["src", "app", "components", "pages", "lib", "utils", "index"].includes(part.toLowerCase())) {
      return part.toLowerCase().replace(/[^a-z0-9]/g, "-");
    }
  }

  return "general";
}

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
      .filter(w => w.length > 2);
    keywords.push(...words);
  }

  return [...new Set(keywords)].slice(0, 5);
}

/**
 * Execute the rlm_smart_memory tool
 */
export async function executeSmartMemory(
  params: RLMSmartMemoryInput
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const projectName = params.project_name;

  // Check if project exists
  const exists = await projectExists(projectName);
  if (!exists) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Project '${projectName}' not found. Use rlm_init to create it first.`,
          success: false
        }, null, 2)
      }]
    };
  }

  await updateLastAccessed(projectName);

  // Load database
  const database = await loadDatabase(projectName);
  const now = new Date().toISOString();
  const memoryId = `mem_${uuidv4().slice(0, 8)}`;

  // Extract rich metadata using Gemini
  const metadata = await extractRichMetadata(
    params.user_prompt,
    params.changes_context,
    params.files_modified
  );

  // Create memory entry
  const memory: MemoryEntry = {
    id: memoryId,
    timestamp: now,
    project_id: projectName,
    user_prompt: params.user_prompt,
    changes_summary: metadata.memorySummary,
    files_modified: params.files_modified.map(f => f.path),
    keywords: [
      ...metadata.keywords,
      ...(params.affected_areas || []),
      ...(params.new_features || [])
    ].slice(0, 15)
  };

  // Add to memory log
  database.memory_log.push(memory);
  await saveMemoryLog(projectName, database.memory_log);

  // Update file map with rich metadata
  const updatedPaths: string[] = [];

  for (const file of params.files_modified) {
    const existingIndex = database.file_map.findIndex(f => f.path === file.path);
    const fileMetadata = metadata.fileMetadata[file.path] || {
      description: file.change_summary,
      component_type: inferComponentType(file.path),
      feature_area: inferFeatureArea(file.path),
      keywords: extractKeywordsFromPath(file.path)
    };

    // Create edit history entry
    const editEntry: EditHistoryEntry = {
      date: now,
      summary: file.change_summary,
      memory_id: memoryId
    };

    if (existingIndex >= 0) {
      // Update existing entry
      const existing = database.file_map[existingIndex];
      const editHistory = existing.edit_history || [];
      editHistory.push(editEntry);

      database.file_map[existingIndex] = {
        ...existing,
        description: file.change_type === "deleted" ? `[DELETED] ${existing.description}` : fileMetadata.description,
        last_modified: now,
        keywords: [...new Set([...existing.keywords, ...fileMetadata.keywords])].slice(0, 10),
        edit_history: editHistory.slice(-10), // Keep last 10 edits
        component_type: fileMetadata.component_type,
        feature_area: fileMetadata.feature_area
      };
    } else if (file.change_type !== "deleted") {
      // Add new entry
      database.file_map.push({
        path: file.path,
        description: fileMetadata.description,
        last_modified: now,
        keywords: fileMetadata.keywords,
        edit_history: [editEntry],
        component_type: fileMetadata.component_type,
        feature_area: fileMetadata.feature_area
      });
    }

    updatedPaths.push(file.path);
  }

  await saveFileMap(projectName, database.file_map);

  // Handle new features - update site map
  if (params.new_features && params.new_features.length > 0) {
    // Add a memory entry specifically for new features
    const featureMemory: MemoryEntry = {
      id: `feat_${uuidv4().slice(0, 8)}`,
      timestamp: now,
      project_id: projectName,
      user_prompt: `Added new features: ${params.new_features.join(", ")}`,
      changes_summary: `New features/components added to the codebase: ${params.new_features.join(", ")}. Related files: ${params.files_modified.map(f => f.path).join(", ")}`,
      files_modified: params.files_modified.map(f => f.path),
      keywords: ["new-feature", "addition", ...params.new_features.map(f => f.toLowerCase().replace(/\s+/g, "-"))]
    };
    database.memory_log.push(featureMemory);
    await saveMemoryLog(projectName, database.memory_log);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: "Memory created with rich metadata",
        memory_id: memoryId,
        timestamp: now,
        keywords_extracted: metadata.keywords,
        files_updated: updatedPaths.map(path => {
          const meta = metadata.fileMetadata[path];
          return {
            path,
            component_type: meta?.component_type || "unknown",
            feature_area: meta?.feature_area || "general"
          };
        }),
        new_features_tracked: params.new_features || [],
        affected_areas: params.affected_areas || [],
        _confirmation: "The changes have been recorded. Future queries about these files will include this edit history."
      }, null, 2)
    }]
  };
}
