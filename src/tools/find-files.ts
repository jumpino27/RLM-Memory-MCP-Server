/**
 * find_files_by_intent tool implementation
 * Semantic file discovery - replaces grep/find with intent-based search
 */

import { type FindFilesByIntentInput } from "../schemas/index.js";
import {
  getFileMap,
  projectExists,
  updateLastAccessed
} from "../services/database.js";
import { matchFilesToIntent } from "../services/gemini.js";
import { ResponseFormat, type FindFilesResult, type FileMapEntry } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

/**
 * Format results as markdown
 */
function formatMarkdown(result: FindFilesResult): string {
  const lines: string[] = [
    `# File Search Results`,
    ``,
    `**Query:** ${result.query}`,
    `**Files Found:** ${result.total}`,
    ``
  ];

  if (result.ai_reasoning) {
    lines.push(`**AI Reasoning:** ${result.ai_reasoning}`);
    lines.push("");
  }

  if (result.files.length === 0) {
    lines.push("*No matching files found in the project map.*");
    lines.push("");
    lines.push("**Suggestions:**");
    lines.push("- The file map might not include this file yet");
    lines.push("- Try using more general keywords");
    lines.push("- Add files to the map using rlm_create_memory after modifications");
    return lines.join("\n");
  }

  lines.push("## Matching Files");
  lines.push("");

  for (const file of result.files) {
    lines.push(`### \`${file.path}\``);
    lines.push("");
    lines.push(`${file.description || "No description"}`);
    lines.push("");
    const keywords = file.keywords || [];
    if (keywords.length > 0) {
      lines.push(`**Keywords:** ${keywords.join(", ")}`);
    }
    lines.push(`**Last Modified:** ${file.last_modified ? new Date(file.last_modified).toLocaleDateString() : "unknown"}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Execute the find_files_by_intent tool
 */
export async function executeFindFiles(
  params: FindFilesByIntentInput
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

  // Get file map
  const fileMap = await getFileMap(projectName);

  if (fileMap.length === 0) {
    const result: FindFilesResult = {
      files: [],
      total: 0,
      query: params.user_prompt,
      ai_reasoning: "No files in project map yet. Use rlm_create_memory to add files after modifications."
    };

    const textContent = params.response_format === ResponseFormat.MARKDOWN
      ? formatMarkdown(result)
      : JSON.stringify(result, null, 2);

    return {
      content: [{ type: "text", text: textContent }]
    };
  }

  // Use Gemini to match intent to files with enhanced data
  const aiResult = await matchFilesToIntent(
    params.user_prompt,
    fileMap.map(f => ({
      path: f.path,
      description: f.description || "",
      keywords: f.keywords || [],
      component_type: f.component_type,
      feature_area: f.feature_area,
      edit_history: f.edit_history
    }))
  );

  // Build result with full file info
  const matchedFiles: FileMapEntry[] = aiResult.files
    .map(path => fileMap.find(f => f.path === path))
    .filter((f): f is FileMapEntry => f !== undefined)
    .slice(0, params.limit);

  let result: FindFilesResult = {
    files: matchedFiles,
    total: matchedFiles.length,
    query: params.user_prompt,
    ai_reasoning: aiResult.reasoning
  };

  // Format output
  let textContent: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    textContent = formatMarkdown(result);
  } else {
    textContent = JSON.stringify(result, null, 2);
  }

  // Check character limit
  if (textContent.length > CHARACTER_LIMIT) {
    const truncatedFiles = matchedFiles.slice(0, Math.ceil(matchedFiles.length / 2));
    result = {
      ...result,
      files: truncatedFiles,
      total: truncatedFiles.length
    };

    if (params.response_format === ResponseFormat.MARKDOWN) {
      textContent = formatMarkdown(result);
      textContent += `\n\n*Note: Results truncated. Be more specific in your query.*`;
    } else {
      textContent = JSON.stringify({
        ...result,
        truncated: true,
        truncation_message: "Results truncated due to size."
      }, null, 2);
    }
  }

  return {
    content: [{ type: "text", text: textContent }]
  };
}
