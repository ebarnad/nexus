---
description: Schedule hourly activity-scanner for work-update signals
---
Schedule `activity-scanner` every hour for this Pi session.

Use this exact scheduled subagent intent:

Scan Slack, Gmail, Calendar, `TASKS.md`, and relevant memory for recent work-update signals. Return concise high-confidence findings only. Include Scanner metadata with the run time and sources scanned. Focus on blockers, commitments, missing tasks, waiting-on changes, completion signals, and durable memory candidates. Do not edit files, post messages, or mutate external systems.
