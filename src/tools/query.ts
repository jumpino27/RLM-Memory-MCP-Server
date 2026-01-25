/**
 * rlm_query tool implementation
 *
 * This is the key tool for bi-directional AI agent ↔ MCP communication.
 * The AI agent asks: "The user wants X, what files should I look at?"
 * The MCP's Gemini searches memory + file map + edit history to provide a smart answer.
 */

import { type RLMQueryInput } from "../schemas/index.js";
import {
  loadDatabase,
  projectExists,
  updateLastAccessed
} from "../services/database.js";
import { generateContent } from "../services/gemini.js";
import type { QueryResult, FileMapEntry, MemoryEntry } from "../types.js";

/**
 * Analyze the user request and find relevant files using Gemini
 */
async function analyzeRequestWithAI(
  userRequest: string,
  fileMap: FileMapEntry[],
  memories: MemoryEntry[]
): Promise<{
  relevantFiles: string[];
  analysis: string;
  suggestions: string[];
}> {
  // Build context for Gemini
  const fileContext = fileMap.map(f => {
    const editHistory = f.edit_history?.slice(-3).map(e => `  - ${e.date}: ${e.summary}`).join("\n") || "";
    const keywords = f.keywords || [];
    return `- ${f.path}
  Description: ${f.description || "No description"}
  Keywords: ${keywords.join(", ") || "none"}
  Component Type: ${f.component_type || "unknown"}
  Feature Area: ${f.feature_area || "unknown"}
  Last Modified: ${f.last_modified || "unknown"}
  ${editHistory ? `Recent Changes:\n${editHistory}` : ""}`;
  }).join("\n\n");

  const memoryContext = memories.slice(0, 10).map(m =>
    `- [${m.id}] ${m.user_prompt}\n  Changes: ${m.changes_summary}\n  Files: ${m.files_modified.join(", ")}`
  ).join("\n\n");

  const prompt = `You are an AI assistant helping another AI agent find relevant files for a coding task.
The user's request has been analyzed, and you need to identify which files in the codebase are relevant.

USER REQUEST: "${userRequest}"

AVAILABLE FILES IN CODEBASE:
${fileContext || "No files indexed yet."}

RECENT PROJECT HISTORY:
${memoryContext || "No previous work history."}

Based on the user request, analyze:
1. Which files are DIRECTLY relevant to this task (must work on)
2. Which files are INDIRECTLY relevant (might need to reference)
3. What the AI agent should know before starting

IMPORTANT RULES:
- Be SPECIFIC: If the user wants to change ONE button, don't return ALL button components
- Look at the component_type and feature_area to narrow down
- Consider the edit history - if a file was recently modified for similar work, it's more relevant
- Look at memory history - if similar work was done before, those files are likely relevant

Return ONLY a JSON object with this exact structure:
{
  "relevant_files": ["path1", "path2"],
  "analysis": "Brief explanation of why these files are relevant and how they relate to the request",
  "suggestions": ["Suggestion 1 for the AI agent", "Suggestion 2"]
}`;

  try {
    const response = await generateContent(prompt);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (error) {
    // Fallback to keyword-based matching
  }

  // Fallback: keyword-based matching
  const requestWords = userRequest.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const matchedFiles = fileMap.filter(f => {
    const keywords = f.keywords || [];
    const fileText = `${f.path} ${f.description || ""} ${keywords.join(" ")} ${f.component_type || ""} ${f.feature_area || ""}`.toLowerCase();
    return requestWords.some(word => fileText.includes(word));
  });

  return {
    relevantFiles: matchedFiles.slice(0, 10).map(f => f.path),
    analysis: "Matched using keyword-based search (AI analysis unavailable)",
    suggestions: ["Consider indexing the codebase with read_content=true for better analysis"]
  };
}

/**
 * Find relevant memories based on the user request
 */
function findRelevantMemories(
  userRequest: string,
  memories: MemoryEntry[],
  limit: number = 5
): MemoryEntry[] {
  const requestWords = userRequest.toLowerCase().split(/\W+/).filter(w => w.length > 2);

  // Score memories by relevance
  const scored = memories.map(memory => {
    const memoryText = [
      memory.user_prompt || "",
      memory.changes_summary || "",
      ...(memory.keywords || []),
      ...(memory.files_modified || [])
    ].join(" ").toLowerCase();

    const score = requestWords.reduce((acc, word) => {
      return acc + (memoryText.includes(word) ? 1 : 0);
    }, 0);

    return { memory, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.memory);
}

/**
 * Execute the rlm_query tool
 */
export async function executeQuery(
  params: RLMQueryInput
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
  const fileMap = database.file_map;
  const memories = database.memory_log;

  if (fileMap.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: "No files indexed in this project yet.",
          suggestion: "Use rlm_index_codebase to scan the codebase first, or add files via rlm_smart_memory after making changes.",
          relevant_files: [],
          relevant_memories: [],
          success: true
        }, null, 2)
      }]
    };
  }

  // Analyze with AI
  const aiAnalysis = await analyzeRequestWithAI(
    params.user_request,
    fileMap,
    memories
  );

  // Get detailed file info for relevant files (with defensive checks)
  const relevantFilePaths = aiAnalysis.relevantFiles || [];
  const relevantFileDetails = relevantFilePaths
    .map(path => fileMap.find(f => f.path === path))
    .filter((f): f is FileMapEntry => f !== undefined)
    .slice(0, params.max_files)
    .map(f => {
      const keywords = f.keywords || [];
      return {
        path: f.path,
        description: f.description || "No description",
        relevance_reason: keywords.length > 0
          ? `Matches request based on: ${keywords.slice(0, 3).join(", ")}`
          : "Matched by AI analysis",
        last_modified: f.last_modified || "unknown",
        recent_changes: f.edit_history?.slice(-3).map(e => e.summary),
        component_type: f.component_type,
        feature_area: f.feature_area
      };
    });

  // Get relevant memories if requested
  let relevantMemoryDetails: Array<{
    id: string;
    summary: string;
    date: string;
    files: string[];
  }> = [];

  if (params.include_memories) {
    const relevantMemories = findRelevantMemories(params.user_request, memories);
    relevantMemoryDetails = relevantMemories.map(m => ({
      id: m.id,
      summary: m.changes_summary,
      date: m.timestamp,
      files: m.files_modified
    }));
  }

  const result: QueryResult = {
    relevant_files: relevantFileDetails,
    relevant_memories: relevantMemoryDetails,
    ai_analysis: aiAnalysis.analysis || "Analysis not available",
    suggestions: params.include_suggestions ? (aiAnalysis.suggestions || []) : undefined
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        user_request: params.user_request,
        ...result,
        _instructions: "These are the files relevant to the user's request. Start with the files at the top of the list. Check the recent_changes to understand what was done before."
      }, null, 2)
    }]
  };
}
