/**
 * manage_sitemap tool implementation
 * Allows AI agents to manage sitemap entries when files are moved, deleted, or updated
 */

import { z } from "zod";
import {
  loadDatabase,
  saveFileMap,
  projectExists,
  updateLastAccessed,
  deleteFileFromMap
} from "../services/database.js";
import type { FileMapEntry } from "../types.js";

/**
 * Schema for rlm_manage_sitemap tool
 */
export const RLMManageSitemapInputSchema = z.object({
  project_name: z.string()
    .min(1, "Project name is required")
    .max(100, "Project name must not exceed 100 characters")
    .describe("Name of the project"),
  operations: z.array(z.object({
    action: z.enum(["delete", "move", "update"])
      .describe("Action to perform: 'delete' removes entry, 'move' updates path, 'update' modifies metadata"),
    file_path: z.string()
      .describe("Current file path in the sitemap"),
    new_path: z.string()
      .optional()
      .describe("New file path (required for 'move' action)"),
    updates: z.object({
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      component_type: z.string().optional(),
      feature_area: z.string().optional()
    })
      .optional()
      .describe("Metadata updates (for 'update' action)")
  }))
    .min(1, "At least one operation is required")
    .max(100, "Maximum 100 operations per call")
    .describe("List of operations to perform on sitemap entries")
}).strict();

export type RLMManageSitemapInput = z.infer<typeof RLMManageSitemapInputSchema>;

interface OperationResult {
  action: string;
  file_path: string;
  success: boolean;
  message: string;
  new_path?: string;
}

/**
 * Execute the manage_sitemap tool
 */
export async function executeManageSitemap(
  params: RLMManageSitemapInput
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

  // Load database
  const database = await loadDatabase(projectName);
  const results: OperationResult[] = [];
  let modifiedCount = 0;

  for (const op of params.operations) {
    const result: OperationResult = {
      action: op.action,
      file_path: op.file_path,
      success: false,
      message: ""
    };

    // Find the file entry
    const fileIndex = database.file_map.findIndex(f => f.path === op.file_path);

    switch (op.action) {
      case "delete": {
        if (fileIndex === -1) {
          result.message = `File not found in sitemap: ${op.file_path}`;
        } else {
          database.file_map.splice(fileIndex, 1);
          result.success = true;
          result.message = `Deleted from sitemap: ${op.file_path}`;
          modifiedCount++;
        }
        break;
      }

      case "move": {
        if (!op.new_path) {
          result.message = `'new_path' is required for 'move' action`;
        } else if (fileIndex === -1) {
          result.message = `File not found in sitemap: ${op.file_path}`;
        } else {
          // Check if new path already exists
          const existingNewPath = database.file_map.findIndex(f => f.path === op.new_path);
          if (existingNewPath !== -1 && existingNewPath !== fileIndex) {
            result.message = `Target path already exists in sitemap: ${op.new_path}`;
          } else {
            // Update the path
            database.file_map[fileIndex].path = op.new_path;
            database.file_map[fileIndex].last_modified = new Date().toISOString();
            result.success = true;
            result.new_path = op.new_path;
            result.message = `Moved in sitemap: ${op.file_path} → ${op.new_path}`;
            modifiedCount++;
          }
        }
        break;
      }

      case "update": {
        if (fileIndex === -1) {
          result.message = `File not found in sitemap: ${op.file_path}`;
        } else if (!op.updates) {
          result.message = `'updates' object is required for 'update' action`;
        } else {
          const entry = database.file_map[fileIndex];
          const updates = op.updates;
          const changedFields: string[] = [];

          if (updates.description !== undefined) {
            entry.description = updates.description;
            changedFields.push("description");
          }
          if (updates.keywords !== undefined) {
            entry.keywords = updates.keywords;
            changedFields.push("keywords");
          }
          if (updates.component_type !== undefined) {
            entry.component_type = updates.component_type;
            changedFields.push("component_type");
          }
          if (updates.feature_area !== undefined) {
            entry.feature_area = updates.feature_area;
            changedFields.push("feature_area");
          }

          if (changedFields.length > 0) {
            entry.last_modified = new Date().toISOString();
            result.success = true;
            result.message = `Updated ${op.file_path}: ${changedFields.join(", ")}`;
            modifiedCount++;
          } else {
            result.message = `No fields to update for ${op.file_path}`;
          }
        }
        break;
      }
    }

    results.push(result);
  }

  // Save changes if any modifications were made
  if (modifiedCount > 0) {
    await saveFileMap(projectName, database.file_map);
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  const response = {
    message: `Sitemap management complete`,
    project_name: projectName,
    summary: {
      total_operations: results.length,
      successful: successCount,
      failed: failCount,
      sitemap_entries_remaining: database.file_map.length
    },
    results
  };

  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}
