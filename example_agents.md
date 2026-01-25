# RLM Memory - AI Agent Rules

## Quick Reference (NEW Recommended Workflow)

```
START TASK → rlm_query → DO WORK → rlm_smart_memory
```

## Legacy Workflow (Still Supported)

```
START TASK → rlm_recall_memory → rlm_find_files_by_intent → DO WORK → rlm_create_memory
```

---

## Mandatory Rules

1. **Always call `rlm_smart_memory` (or `rlm_create_memory`) after completing any task** - This is non-negotiable
2. **Call `rlm_query` first** when starting a task to get relevant files and context
3. **After indexing a codebase**, call `rlm_verify_index` to confirm everything is indexed
4. **Use `rlm_find_files_by_intent`** instead of grep/find/ls for file discovery
5. **When files are moved/deleted**, call `rlm_manage_sitemap` to keep the sitemap in sync

---

## Tool Usage

### On First Use (New/Existing Project)

```
1. rlm_init           → Create project
2. rlm_index_codebase → Scan existing files (skip if new project)
3. rlm_verify_index   → Confirm indexing is complete
```

### Every Task (NEW Recommended)

```
1. rlm_query          → Get relevant files + past context + suggestions
2. [Do the actual work]
3. rlm_smart_memory   → Record what was done with rich metadata (MANDATORY!)
```

### Every Task (Legacy)

```
1. rlm_recall_memory       → Get context (keywords from user prompt)
2. rlm_find_files_by_intent → Find relevant files
3. [Do the actual work]
4. rlm_create_memory       → Record what was done (MANDATORY!)
```

---

## Examples

### User says: "Fix the login bug"

**NEW Recommended Approach:**
```json
// Step 1: Query for relevant files and context
{
  "tool": "rlm_query",
  "project_name": "my-app",
  "user_request": "The user wants to fix the login bug - likely authentication issue",
  "include_memories": true,
  "include_suggestions": true
}

// Step 2: [Fix the bug based on returned files and AI suggestions]

// Step 3: Create smart memory with context
{
  "tool": "rlm_smart_memory",
  "project_name": "my-app",
  "user_prompt": "Fix the login bug",
  "changes_context": "Fixed null check in auth validation that caused login failures when session expired",
  "files_modified": [
    {
      "path": "src/auth/login.ts",
      "change_type": "modified",
      "change_summary": "Added null check for session token validation"
    }
  ],
  "affected_areas": ["auth", "validation"]
}
```

**Legacy Approach:**
```json
// Step 1: Recall
{ "tool": "rlm_recall_memory", "project_name": "my-app", "keywords": ["login", "auth", "bug"] }

// Step 2: Find files
{ "tool": "rlm_find_files_by_intent", "project_name": "my-app", "user_prompt": "fix login bug" }

// Step 3: [Fix the bug]

// Step 4: Create memory
{
  "tool": "rlm_create_memory",
  "project_name": "my-app",
  "user_prompt": "Fix the login bug",
  "changes_summary": "Fixed null check in auth validation that caused login failures",
  "files_modified": ["src/auth/login.ts"],
  "keywords": ["login", "auth", "bug", "validation"]
}
```

### User says: "Index this project"

```json
// Step 1: Initialize project
{ "tool": "rlm_init", "project_name": "my-app", "working_directory": "D:\\projects\\my-app" }

// Step 2: Index codebase
{ "tool": "rlm_index_codebase", "project_name": "my-app", "directory_path": "D:\\projects\\my-app", "max_files": 200, "read_content": true }

// Step 3: IMPORTANT - Verify the indexing
{ "tool": "rlm_verify_index", "project_name": "my-app", "expected_features": ["auth", "api", "components"] }
```

### User says: "Change the submit button color"

```json
// Step 1: Query (this will return ONLY the relevant button, not all UI components)
{
  "tool": "rlm_query",
  "project_name": "my-app",
  "user_request": "Change the submit button color in the login form",
  "max_files": 5
}
// Returns: LoginForm.tsx, theme.ts (NOT all buttons in the app!)

// Step 2: [Make the change]

// Step 3: Smart memory
{
  "tool": "rlm_smart_memory",
  "project_name": "my-app",
  "user_prompt": "Change submit button color",
  "changes_context": "Updated the submit button in LoginForm to use primary theme color",
  "files_modified": [
    {
      "path": "src/components/LoginForm.tsx",
      "change_type": "modified",
      "change_summary": "Changed button backgroundColor from blue to theme.primary"
    }
  ],
  "affected_areas": ["ui", "auth"]
}
```

---

## New Tools Explained

### `rlm_query` (PRIMARY - Use This!)

The main tool for AI agent ↔ MCP communication.
- Searches file map, memories, AND edit history
- Returns relevant files with component types and feature areas
- Provides AI analysis and suggestions
- **Use this instead of rlm_recall_memory + rlm_find_files_by_intent**

### `rlm_smart_memory` (RECOMMENDED)

Enhanced memory creation with rich metadata.
- Provide detailed `changes_context` - Gemini extracts keywords
- Specify `files_modified` with `change_type` and `change_summary`
- Optionally list `new_features` and `affected_areas`
- **Use this instead of rlm_create_memory**

### `rlm_verify_index` (Use After Indexing)

Verifies that indexing is complete.
- Returns files grouped by component type and feature area
- Detects potential gaps (missing tests, expected features)
- Asks: "Is this everything?"

---

## Keyword Extraction Tips

When using legacy tools, extract 3-7 keywords from user prompts:
- "Fix the submit button" → `["submit", "button", "form", "ui", "click"]`
- "Add JWT authentication" → `["jwt", "auth", "token", "security", "login"]`
- "Optimize database queries" → `["database", "query", "performance", "sql", "optimization"]`

**Note:** With `rlm_query` and `rlm_smart_memory`, keyword extraction is handled automatically by Gemini.

---

## Common Mistakes to Avoid

- Forgetting to call `rlm_smart_memory` or `rlm_create_memory` after work
- Using grep/find instead of `rlm_query` or `rlm_find_files_by_intent`
- Not verifying indexing with `rlm_verify_index`
- Using generic keywords like "fix", "update", "change" (legacy tools only)
- Not providing detailed `changes_context` in `rlm_smart_memory`

---

## Response Format

Tools support `response_format`: `"json"` (default) or `"markdown"` (human-readable)

---

## When Gemini API is Unavailable

All tools have keyword-based fallbacks:
- `rlm_query`: Uses weighted keyword matching with component type and feature area
- `rlm_smart_memory`: Infers types from file paths
- `rlm_find_files_by_intent`: Basic keyword search

The system will still work, just with less intelligent matching.

---

## Sitemap Management

### `rlm_manage_sitemap` (Keep Sitemap In Sync)

Use this when files in the codebase are moved, deleted, or need metadata updates.

**Actions:**
- `delete`: Remove a file entry from the sitemap
- `move`: Update a file's path (when renamed/moved)
- `update`: Modify file metadata (description, keywords, component_type, feature_area)

### Example: Files were deleted

```json
{
  "tool": "rlm_manage_sitemap",
  "project_name": "my-app",
  "operations": [
    { "action": "delete", "file_path": "src/deprecated/old-utils.ts" },
    { "action": "delete", "file_path": "src/components/LegacyButton.tsx" }
  ]
}
```

### Example: File was moved/renamed

```json
{
  "tool": "rlm_manage_sitemap",
  "project_name": "my-app",
  "operations": [
    { "action": "move", "file_path": "src/utils.ts", "new_path": "src/lib/utils.ts" },
    { "action": "move", "file_path": "src/Button.tsx", "new_path": "src/components/ui/Button.tsx" }
  ]
}
```

### Example: Update file metadata

```json
{
  "tool": "rlm_manage_sitemap",
  "project_name": "my-app",
  "operations": [
    {
      "action": "update",
      "file_path": "src/auth/login.ts",
      "updates": {
        "description": "Handles JWT-based authentication",
        "keywords": ["jwt", "auth", "login", "token"],
        "component_type": "service",
        "feature_area": "security"
      }
    }
  ]
}
```

### When to Use

- After deleting files from the codebase
- After renaming or moving files
- After refactoring that changes file purposes
- When file metadata becomes outdated

**Note:** You can combine multiple operations in a single call for efficiency.
