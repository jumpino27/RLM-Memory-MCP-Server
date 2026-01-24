# RLM Memory - AI Agent Rules

## Quick Reference

```
START TASK → rlm_recall_memory → rlm_find_files_by_intent → DO WORK → rlm_create_memory
```

---

## Mandatory Rules

1. **Always call `rlm_create_memory` after completing any task** - This is non-negotiable
2. **Call `rlm_recall_memory` first** when starting a task to get relevant context
3. **Use `rlm_find_files_by_intent`** instead of grep/find/ls for file discovery

---

## Tool Usage

### On First Use (New/Existing Project)
```
1. rlm_init          → Create project
2. rlm_index_codebase → Scan existing files (skip if new project)
```

### Every Task
```
1. rlm_recall_memory       → Get context (keywords from user prompt)
2. rlm_find_files_by_intent → Find relevant files
3. [Do the actual work]
4. rlm_create_memory       → Record what was done (MANDATORY!)
```

---

## Examples

### User says: "Fix the login bug"
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
{ "tool": "rlm_init", "project_name": "my-app", "working_directory": "D:\\projects\\my-app" }
{ "tool": "rlm_index_codebase", "project_name": "my-app", "directory_path": "D:\\projects\\my-app", "max_files": 200 }
```

---

## Keyword Extraction Tips

Extract 3-7 keywords from user prompts:
- "Fix the submit button" → `["submit", "button", "form", "ui", "click"]`
- "Add JWT authentication" → `["jwt", "auth", "token", "security", "login"]`
- "Optimize database queries" → `["database", "query", "performance", "sql", "optimization"]`

---

## Common Mistakes to Avoid

- Forgetting to call `rlm_create_memory` after work
- Using grep/find instead of `rlm_find_files_by_intent`
- Not recalling memory before starting work
- Using generic keywords like "fix", "update", "change"

---

## Response Format

Tools support `response_format`: `"json"` (default) or `"markdown"` (human-readable)
