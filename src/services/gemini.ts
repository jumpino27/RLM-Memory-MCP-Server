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
 * Match user intent to files using Gemini
 */
export async function matchFilesToIntent(
  intent: string,
  files: Array<{ path: string; description: string; keywords: string[] }>
): Promise<{ files: string[]; reasoning: string }> {
  if (files.length === 0) {
    return { files: [], reasoning: "No files in the project map yet." };
  }

  const filesText = files
    .map(f => `- ${f.path}: ${f.description} [${f.keywords.join(", ")}]`)
    .join("\n");

  const prompt = `You are an AI assistant helping to find relevant files in a codebase.
Given the user's intent and a list of files with descriptions, return the most relevant file paths.

User Intent: ${intent}

Available Files:
${filesText}

Return ONLY a JSON object with this structure:
{
  "files": ["path1", "path2"],
  "reasoning": "Brief explanation of why these files match"
}

Select files that best match the user's intent. Be precise and only include truly relevant files.`;

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
    // Fallback: simple keyword matching
    const intentWords = intent.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const matchedFiles = files.filter(f => {
      const fileText = `${f.path} ${f.description} ${f.keywords.join(" ")}`.toLowerCase();
      return intentWords.some(word => fileText.includes(word));
    });
    return {
      files: matchedFiles.map(f => f.path),
      reasoning: "Matched using keyword fallback (AI unavailable)"
    };
  }
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
