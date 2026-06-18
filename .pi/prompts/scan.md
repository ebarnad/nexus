---
description: Schedule activity-scanner during work hours for work-update signals
---
Schedule `activity-scanner` for 9am, 12pm, 3pm, and 6pm Monday-Friday in this Pi session.

Use this schedule expression: `0 0 9,12,15,18 * * 1-5`.

Use this exact scheduled subagent intent:

Scan Slack, Gmail, Calendar, `TASKS.md`, and relevant memory for recent work-update signals. Return concise high-confidence findings only. Include Scanner metadata with the run time and sources scanned. Focus on blockers, commitments, missing tasks, waiting-on changes, completion signals, and durable memory candidates. Do not edit files, post messages, or mutate external systems.
