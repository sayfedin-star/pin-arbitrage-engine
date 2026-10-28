---
name: writing-guidelines
description: "Review and enforce Writing Guidelines, voice, tone, terminology consistency, microcopy, error states, and button labels. Use automatically whenever creating, reviewing, editing, or auditing user-facing copy in frontend UI files or design documentation, specifically: src/dashboard-ui.mjs, src/keywords-ui.mjs, src/domains-ui.mjs, src/discovery-ui.mjs, src/campaign-folders-ui.mjs, src/pin-details-ui.mjs, src/ui/app-sidebar.mjs, src/ui/campaign-workspace-header.mjs, src/ui/dashboard-modals.mjs, src/ui/keywords-drawers.mjs, and DESIGN.md."
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Writing Guidelines

Review files for compliance with Writing Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/writing-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
