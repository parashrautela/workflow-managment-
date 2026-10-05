---
trigger: always_on
description: Frontend development conventions and file location rules.
---

# Frontend Guidelines

- **Root Directory**: All frontend code, components, styles, assets, configuration, and dependencies must reside strictly inside the [`frontend/`](file:///Users/office/Desktop/Workflow%20management%20tool/workflow-managment-/frontend) directory.
- **Assets & Media**: All static assets, icons, and generated images related to the UI belong in `frontend/public/` or `frontend/src/assets/`.
- **Design Specifications**: Adhere to the design tokens and system defined in [`frontend/DESIGN.md`](file:///Users/office/Desktop/Workflow%20management%20tool/workflow-managment-/frontend/DESIGN.md).
- **Mobile-First Priority**: Always design, structure, style, and test for mobile screen resolutions (360px – 430px) before desktop. Ensure all tabs, forms, inputs, modals, cards, and drawers are touch-optimized, horizontally scrollable without clipping, and never overlap content on mobile viewports.
