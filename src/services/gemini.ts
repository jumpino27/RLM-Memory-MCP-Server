/**
 * Gemini API Service
 * Handles all interactions with Google's Gemini 3 Flash Preview model
 */

import axios from "axios";
import { GEMINI_API_URL, GEMINI_MODEL } from "../constants.js";
import type { GeminiGenerateResponse } from "../types.js";

let apiKey: string | undefined;

export function initGemini(key: string): void {
  apiKey = key;
}

export function getApiKey(): string {
  if (!apiKey) {
    throw new Error("Gemini API key not initialized. Set GEMINI_API_KEY environment variable.");
  }
  return apiKey;
}

/**
 * Generate content using Gemini 3 Flash Preview
 */
export async function generateContent(prompt: string): Promise<string> {
  const key = getApiKey();

  try {
    const response = await axios.post<GeminiGenerateResponse>(
      `${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        timeout: 30000
      }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No content in Gemini response");
    }
    return text;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error("Rate limit exceeded. Please wait before making more requests.");
      }
      if (error.response?.status === 401) {
        throw new Error("Invalid Gemini API key. Please check your GEMINI_API_KEY.");
      }
      throw new Error(`Gemini API error: ${error.response?.status} - ${error.message}`);
    }
    throw error;
  }
}

/**
 * Common words to exclude from keywords (stop words)
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
  "through", "within", "across", "between", "along", "during"
]);

/**
 * Fallback keyword extraction without AI
 */
function extractKeywordsFallback(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Split camelCase
    .split(/[\W_]+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
    .filter((word, index, arr) => arr.indexOf(word) === index)
    .slice(0, 7);
}

/**
 * Extract keywords from text using Gemini
 */
export async function extractKeywords(text: string): Promise<string[]> {
  const prompt = `Extract 5-7 relevant technical keywords from the following text.
Focus on: specific technologies, features, concepts, and domain terms.
Avoid generic words like: "file", "this", "function", "data", "code", "used", "provides".
Return ONLY a JSON array of lowercase strings, no explanations.
Example output: ["authentication", "jwt", "middleware", "login", "session"]

Text: ${text}`;

  try {
    const response = await generateContent(prompt);
    // Extract JSON array from response
    const match = response.match(/\[[\s\S]*?\]/);
    if (match) {
      const keywords = JSON.parse(match[0]) as string[];
      return keywords.map(k => k.toLowerCase().trim()).filter(k => !STOP_WORDS.has(k));
    }
    return extractKeywordsFallback(text);
  } catch {
    // Fallback: smart keyword extraction without AI
    return extractKeywordsFallback(text);
  }
}

/**
 * Enhanced file data for semantic matching
 */
interface EnhancedFileData {
  path: string;
  description: string;
  keywords: string[];
  component_type?: string;
  feature_area?: string;
  edit_history?: Array<{ date: string; summary: string }>;
}

/**
 * Match user intent to files using Gemini with enhanced semantic search
 * Now considers component type, feature area, and edit history
 */
export async function matchFilesToIntent(
  intent: string,
  files: Array<EnhancedFileData>
): Promise<{ files: string[]; reasoning: string }> {
  if (files.length === 0) {
    return { files: [], reasoning: "No files in the project map yet." };
  }

  // Build rich file context including edit history
  const filesText = files
    .map(f => {
      const keywords = f.keywords || [];
      const history = f.edit_history?.slice(-2).map(e => `    • ${e.summary || "unknown"}`).join("\n") || "";
      return `- ${f.path}
    Description: ${f.description || "No description"}
    Type: ${f.component_type || "unknown"} | Area: ${f.feature_area || "general"}
    Keywords: [${keywords.join(", ") || "none"}]
    ${history ? `Recent edits:\n${history}` : ""}`;
    })
    .join("\n\n");

  const prompt = `You are an AI assistant helping to find relevant files in a codebase.
Given the user's intent and a list of files with descriptions, return the most relevant file paths.

User Intent: "${intent}"

Available Files:
${filesText}

IMPORTANT RULES FOR SELECTION:
1. Be SPECIFIC - if the user mentions "the submit button", find THAT specific button, not all buttons
2. Use component_type and feature_area to narrow down - don't return all UI components
3. Consider edit history - files recently edited for similar tasks are more relevant
4. Prioritize exact matches over partial matches
5. Return files in order of relevance (most relevant first)
6. Maximum 5-7 files unless the task clearly requires more

Return ONLY a JSON object with this structure:
{
  "files": ["path1", "path2"],
  "reasoning": "Brief explanation of why these specific files were selected"
}`;

  try {
    const response = await generateContent(prompt);
    // Extract JSON object from response
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]) as { files: string[]; reasoning: string };
      return result;
    }
    return { files: [], reasoning: "Could not parse AI response" };
  } catch (error) {
    // Fallback: smart keyword matching with type/area consideration
    return smartKeywordMatch(intent, files);
  }
}

/**
 * Smart keyword matching fallback with component type and feature area consideration
 */
function smartKeywordMatch(
  intent: string,
  files: Array<EnhancedFileData>
): { files: string[]; reasoning: string } {
  const intentWords = intent.toLowerCase().split(/\W+/).filter(w => w.length > 2);

  // Score each file
  const scored = files.map(file => {
    let score = 0;
    const keywords = file.keywords || [];
    const fileText = `${file.path} ${file.description || ""} ${keywords.join(" ")}`.toLowerCase();

    // Base score from keyword matches
    for (const word of intentWords) {
      if (fileText.includes(word)) score += 1;
      // Boost if word appears in path (more specific)
      if (file.path.toLowerCase().includes(word)) score += 2;
    }

    // Boost for component type match
    if (file.component_type) {
      const typeWords = file.component_type.toLowerCase().split("-");
      for (const word of intentWords) {
        if (typeWords.some(tw => tw.includes(word) || word.includes(tw))) {
          score += 3;
        }
      }
    }

    // Boost for feature area match
    if (file.feature_area) {
      const areaWords = file.feature_area.toLowerCase().split("-");
      for (const word of intentWords) {
        if (areaWords.some(aw => aw.includes(word) || word.includes(aw))) {
          score += 3;
        }
      }
    }

    // Boost for recent edits (more active files)
    if (file.edit_history && file.edit_history.length > 0) {
      score += 1;
      // Check if recent edits are related
      const recentEdits = file.edit_history.slice(-3).map(e => (e.summary || "").toLowerCase()).join(" ");
      for (const word of intentWords) {
        if (recentEdits.includes(word)) score += 2;
      }
    }

    return { file, score };
  });

  // Sort by score and return top matches
  const topMatches = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  return {
    files: topMatches.map(m => m.file.path),
    reasoning: `Matched using keyword analysis with component type and feature area weighting (AI unavailable). Top matches scored by: keyword presence, path specificity, type/area relevance, and recent edit history.`
  };
}

/**
 * Generate a file description from its path and context
 */
export async function generateFileDescription(
  filePath: string,
  context: string
): Promise<string> {
  const prompt = `Based on the file path and context, generate a brief (1-2 sentence) description of what this file likely does.

File Path: ${filePath}
Context: ${context}

Return ONLY the description, no explanations or formatting.`;

  try {
    const response = await generateContent(prompt);
    return response.trim();
  } catch {
    // Fallback: generate description from path
    const parts = filePath.split(/[/\\]/);
    const fileName = parts[parts.length - 1];
    return `File: ${fileName} in ${parts.slice(0, -1).join("/")}`;
  }
}
