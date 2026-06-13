---
name: journal-sync
description: "Pull new journal entries from Notion and append them to memory/journals/ following existing conventions."
tools: [Bash]
---

# Journal Sync

Syncs new entries from Notion's Journal database into `memory/journals/month_YYYY-MM_text.txt` files, preserving your existing archive convention.

## How It Works

1. **Query Notion** — Use `ntn api v1/data_sources/{data_source_id}/query -X POST` with date filters to pull entries
2. **Handle sort quirk** — Reorder results chronologically (Notion sorts alphabetically by Name, not by date)
3. **Write output** — Append each entry as its own block to `memory/journals/month_YYYY-MM_text.txt`, creating the file if it doesn't exist

## Run Logic

Execute these steps in order:

### 1. Query Notion with Date Filters

```bash
# Pull entries from a date range (adjust dates as needed)
cat <<'JSON' | npm run --silent ntn api v1/data_sources/{data_source_id}/query -X POST \
  'filter[or][0][property]=Date[on_or_after]'="2026-01-01" \
  'filter[or][1][property]=Date[on_or_before]'="2026-06-30" | jq .
```

For a full historical pull, omit the date filters:

```bash
npm run --silent ntn api v1/data_sources/{data_source_id}/query -X POST | jq '.results'
```

### 2. Reorder Chronologically

Notion returns results sorted alphabetically by Name (the sort quirk). Fix this with `jq`:

```bash
# Sort results by date field, descending (newest first)
npm run --silent ntn api v1/data_sources/{data_source_id}/query -X POST | \
  jq '[.results[] | {date: .created_at, content: .properties.Name[0].text[0].content}] | sort_by(.date) | reverse'
```

Adjust the date field path (e.g., `.properties.Date[0].date.start`) based on your actual schema.

### 3. Parse and Write Entries

Extract each entry's text content and append to the correct monthly file:

```bash
# Process each entry, write to month_YYYY-MM_text.txt files
jq -r '.results[] | "\(.properties.Name[0].text[0].content)\n---\n"' | \
  while IFS= read -r entry; do
    # Extract date from entry properties (adjust path for your schema)
    date=$(echo "$entry" | jq -r '...')  # Get the entry's date
    month_file="memory/journals/month_$(echo $date | cut -c1-7)_text.txt"
    
    # Append to monthly file, creating if needed
    echo "$entry" >> "$month_file"
  done
```

Or use a more robust bash script:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Query Notion data source with optional date filters
if [ $# -gt 0 ]; then
  # With date arguments
  npm run --silent ntn api v1/data_sources/{data_source_id}/query -X POST \
    "filter[property]=Date[on_or_after]"="$1" \
    "filter[property]=Date[on_or_before]"="${2:-}" | jq .
else
  # Full pull, no filters
  npm run --silent ntn api v1/data_sources/{data_source_id}/query -X POST | jq .
fi
```

### 4. Verify Output

After syncing, confirm the files were updated:

```bash
ls -la memory/journals/month_*.txt | tail -5
wc -l memory/journals/month_$(date +%Y-%m)_text.txt
```

## Output Format

Entries are written as plain text blocks matching existing `month_YYYY-MM_text.txt` convention:
- No YAML frontmatter — just raw text preserving Notion formatting
- Each entry is appended in chronological order

## Workflow Rules

- Inherits authentication and installation from the parent `notion` skill
- Use the project helper: `npm run --silent ntn -- ...` so `.env` loads automatically
- Respect Notion API rate limits (~3 requests/second)

## Error Handling

- If Notion returns `404`, verify the journal database is shared with the integration
- If authentication fails, refer to the parent `notion` skill for troubleshooting
- If no new entries exist since last sync, report cleanly rather than failing
- On date parse errors, skip the entry and log a warning
