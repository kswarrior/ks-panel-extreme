# Automation skill

Automation runs cron schedules with 5-field expressions that trigger instance actions or shell workflows on their edge node. Each firing is recorded in automation_runs with status, output and timing for later inspection. Triggered runs dial the edge exec channel with secrets resolved server-side, so secret values never reach the browser and secret_refs stay masked in specs. Operators create and monitor schedules from the instance Automation tab alongside one-shot manual triggers.

Assistant coverage is read-only here: there are no automation tools, so answer from this guide and point at the instance Automation tab. Never claim to create or trigger a schedule.
