# Obsidian Document Rules

## Context Gathering
- Perform a single attempt to access the Obsidian Vault via Model Context Protocol (MCP) using the `advance_search_vault` function with a JsonLogic query to retrieve relevant project notes, specifications, or context (e.g., code patterns, project requirements, or prior documentation).
- Craft a JsonLogic query to search for multiple task-related keywords in a single call, using the `"or"`, `"and"` and other operators to target notes containing any of the keywords. Examples include:
- Searching keywords in contents

    Example:
    ```json
    {
        "or": [
            {
                "in": [
                    "laravel",
                    { "var": "content" }
                ]
            },
            {
                "in": [
                    "php",
                    { "var": "content" }
                ]
            }
        ]
    }
    ```
- Searching for http related keywords in the content, ignoring markdown links

    Example:
    ```json
    {
        "and": [
            {
                "or": [
                    { "in": [ "http", { "var": "content" } ] },
                    { "in": [ "https", { "var": "content" } ] },
                    { "in": [ "url", { "var": "content" } ] },
                    { "in": [ "request", { "var": "content" } ] },
                    { "in": [ "response", { "var": "content" } ] }
                ]
            },
            {
                "!": {
                    "or": [
                        { "in": [ "](http", { "var": "content" } ] },
                        { "in": [ "](https", { "var": "content" } ] }
                    ]
                }
            }
        ]
    }
    ```
- Search using tags
    Example:
    ```json
    {
        "and": [
            { "in": [ "php", { "var": "tags" } ] },
            { "in": [ "laravel", { "var": "tags" } ] }
        ]
    }
    ```
- Include parameters like `max_results: 10` to cap results and prevent excessive data retrieval.
- After retrieving the matching files, analyze each file individually to extract relevant context, prioritizing notes that closely align with the task’s requirements (e.g., specific code patterns or project goals).
- If relevant context is found, use it to inform your approach, ensuring alignment with the project’s goals and conventions.
- If no relevant context is found in the Vault, perform a single web search for reliable sources (e.g., official programming documentation, reputable tutorials, or well-known community resources) to gather additional context, using the same keywords from the JsonLogic query. Do not repeat searches or re-query the Vault to avoid loops.
- Synthesize the Vault and web context (if applicable) to align with the task and project goals. If no context is found, proceed with universal best practices for coding.

## Documentation in Obsidian Vault
- After user confirmation or successful test validation, document the progress in the Obsidian Vault via MCP.
- For dependencies used, create or update a note in `{language}/package/{package_name}.md` (e.g., `{language}/package/requests.md` for a library named `requests`).
- For language features or standard library functionality, create or update a note in `{language}/{language_feature_name}.md` (e.g., `{language}/list_comprehension.md` for a list comprehension feature).
- Use the following format for documentation:
  ```md
  # {package_name or language_feature_name}

  ## {Name of the Function/Feature Used}

  {Short description of the function or feature}

  {When to use it and how to use it effectively}

  ### Examples:
  {Example 1 with code and explanation}
  {Example 2 with code and explanation}
  ```
- Ensure documentation is clear, concise, and includes practical examples reflecting the context of use.
- Update existing notes if the dependency or feature is already documented, appending new examples without overwriting unrelated content.