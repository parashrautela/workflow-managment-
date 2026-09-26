---
name: figma-sync
description: >-
  Work with Figma and FigJam files, inspect design tokens, fetch frame hierarchies,
  and sync UI specifications directly into code using Figma MCP and REST APIs.
---

# Figma Synchronization & Design Workflow

## Overview
This skill guides interacting with Figma designs, FigJam boards, and design tokens for the Workflow Management project.

## Board Details
- **Figma Board URL**: `https://www.figma.com/board/UWscIC0R0NrqZyKUmmuGEB/Untitled?node-id=0-1&t=EMt7WHN72keLxW68-1`
- **File Key**: `UWscIC0R0NrqZyKUmmuGEB`
- **Target Node**: `0:1`

## Authentication & Configuration
To query live nodes and layers:
1. Generate a Figma Personal Access Token at **Figma Settings > Security > Personal access tokens**.
2. Export the token in your environment or store in `.env`:
   ```bash
   export FIGMA_ACCESS_TOKEN="figd_your_token_here"
   export FIGMA_PERSONAL_ACCESS_TOKEN="figd_your_token_here"
   ```

## REST API Fallback
You can also inspect board nodes directly via curl if needed:
```bash
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/UWscIC0R0NrqZyKUmmuGEB/nodes?ids=0:1"
```
