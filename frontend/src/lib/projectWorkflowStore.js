// frontend/src/lib/projectWorkflowStore.js

// Predefined reusable workflow templates for Studio Iksha
export const WORKFLOW_TEMPLATES = [
  {
    id: "template-residential-complete",
    name: "Complete Residential Interior",
    description: "End-to-end residential interior workflow from concept design to civil handover.",
    category: "Residential",
    estimatedDays: 75,
    stages: [
      { id: "stage-concept", name: "1. Concept & Moodboard", durationDays: 7, order: 1 },
      { id: "stage-design-3d", name: "2. 3D Visuals & Detailed Drawings", durationDays: 14, order: 2 },
      { id: "stage-procurement", name: "3. Material & Vendor Sourcing", durationDays: 10, order: 3 },
      { id: "stage-civil-mep", name: "4. Civil & MEP Execution", durationDays: 21, order: 4 },
      { id: "stage-carpentry", name: "5. Joinery, Millwork & Paint", durationDays: 15, order: 5 },
      { id: "stage-styling", name: "6. Decor Styling & Soft Furnishings", durationDays: 5, order: 6 },
      { id: "stage-handover", name: "7. Snagging, Deep Clean & Handover", durationDays: 3, order: 7 },
    ],
    starterTasks: [
      { title: "Site measurement & 2D layout freeze", stageIndex: 0, priority: "high" },
      { title: "Develop material moodboard and color palette", stageIndex: 0, priority: "normal" },
      { title: "3D render generation for Living & Master Bedroom", stageIndex: 1, priority: "high" },
      { title: "Electrical & plumbing marking drawing sign-off", stageIndex: 1, priority: "high" },
      { title: "Tile, sanitaryware & hardware vendor quotes", stageIndex: 2, priority: "normal" },
      { title: "Civil tile laying and false ceiling framing", stageIndex: 3, priority: "high" },
      { title: "Modular carcass fabrication & on-site delivery", stageIndex: 4, priority: "normal" },
    ]
  },
  {
    id: "template-turnkey-fitout",
    name: "Turnkey Renovation & Fitout",
    description: "Fast-track turnkey architectural renovation with structured procurement and contractor checkpoints.",
    category: "Renovation",
    estimatedDays: 45,
    stages: [
      { id: "stage-survey", name: "1. Site Survey & Demolition Plan", durationDays: 5, order: 1 },
      { id: "stage-drawings", name: "2. Working Drawings & BoQ", durationDays: 7, order: 2 },
      { id: "stage-services", name: "3. Electrical, Plumbing & HVAC", durationDays: 14, order: 3 },
      { id: "stage-finishes", name: "4. Surface Finishes, Flooring & Paint", durationDays: 12, order: 4 },
      { id: "stage-fitout-handover", name: "5. Fixtures, Snag List & Handover", durationDays: 7, order: 5 },
    ],
    starterTasks: [
      { title: "Demolition check & structural verification", stageIndex: 0, priority: "high" },
      { title: "Final BoQ sign-off and contractor work order", stageIndex: 1, priority: "high" },
      { title: "Underground conduit & plumbing pressure test", stageIndex: 2, priority: "high" },
      { title: "Floor tile installation and protective sheeting", stageIndex: 3, priority: "normal" },
      { title: "Light fixture testing & final snagging review", stageIndex: 4, priority: "normal" },
    ]
  },
  {
    id: "template-modular-kitchen",
    name: "Modular Kitchen & Wardrobe",
    description: "Specialized factory-to-site workflow for modular cabinetry, stone counters, and appliances.",
    category: "Modular",
    estimatedDays: 30,
    stages: [
      { id: "stage-kitchen-measure", name: "1. Laser Measurement & Appliance Specs", durationDays: 4, order: 1 },
      { id: "stage-kitchen-cad", name: "2. Modular 3D CAD & Elevation Freeze", durationDays: 6, order: 2 },
      { id: "stage-production", name: "3. Factory Carcass & Shutter Production", durationDays: 12, order: 3 },
      { id: "stage-installation", name: "4. Site Assembly & Countertop Template", durationDays: 5, order: 4 },
      { id: "stage-counter-snag", name: "5. Quartz/Granite Fitting & Hardware Check", durationDays: 3, order: 5 },
    ],
    starterTasks: [
      { title: "Verify built-in oven, hob & sink specifications", stageIndex: 0, priority: "high" },
      { title: "Client approval on shutter finish and handle profile", stageIndex: 1, priority: "normal" },
      { title: "Order tandem boxes and lift-up hydraulic fittings", stageIndex: 2, priority: "normal" },
      { title: "Level base carcass modules and install skirting", stageIndex: 3, priority: "high" },
      { title: "Countertop edge profiling and sink under-mount", stageIndex: 4, priority: "high" },
    ]
  },
  {
    id: "template-interior-styling",
    name: "Interior Styling & Soft Furnishing",
    description: "Curated styling, loose furniture selection, custom rugs, curtains, and artwork placement.",
    category: "Styling",
    estimatedDays: 21,
    stages: [
      { id: "stage-style-brief", name: "1. Aesthetic Direction & Budget Matrix", durationDays: 4, order: 1 },
      { id: "stage-sourcing", name: "2. Furniture, Rugs & Lighting Sourcing", durationDays: 7, order: 2 },
      { id: "stage-orders", name: "3. Fabric Swatches & Custom Orders", durationDays: 5, order: 3 },
      { id: "stage-placement", name: "4. Delivery Logistics & On-Site Staging", durationDays: 5, order: 4 },
    ],
    starterTasks: [
      { title: "Present styling lookbook and art inspirations", stageIndex: 0, priority: "normal" },
      { title: "Finalize dining table and pendant light shortlist", stageIndex: 1, priority: "normal" },
      { title: "Curtain fabric drape approvals and rod measurements", stageIndex: 2, priority: "high" },
      { title: "On-site rug placement and artwork hanging", stageIndex: 3, priority: "normal" },
    ]
  },
  {
    id: "template-commercial-workspace",
    name: "Commercial Studio / Retail Fitout",
    description: "Commercial workplace fitout covering compliance, MEP, modular desks, acoustic treatments, and branding.",
    category: "Commercial",
    estimatedDays: 60,
    stages: [
      { id: "stage-comm-plan", name: "1. Space Planning & Authority Approvals", durationDays: 10, order: 1 },
      { id: "stage-comm-mep", name: "2. HVAC, Fire Safety & Data Cabling", durationDays: 15, order: 2 },
      { id: "stage-comm-glass", name: "3. Glass Partitions, Ceilings & Acoustics", durationDays: 14, order: 3 },
      { id: "stage-comm-furniture", name: "4. Workstation Desking & Reception Build", durationDays: 14, order: 4 },
      { id: "stage-comm-handover", name: "5. Testing, Signage & Occupancy Handover", durationDays: 7, order: 5 },
    ],
    starterTasks: [
      { title: "Verify building landlord fitout guidelines", stageIndex: 0, priority: "high" },
      { title: "HVAC ducting routing and diffuser layout sign-off", stageIndex: 1, priority: "high" },
      { title: "Acoustic ceiling baffles and glass cabin walls", stageIndex: 2, priority: "normal" },
      { title: "Modular workstations cable management setup", stageIndex: 3, priority: "normal" },
      { title: "Reception 3D logo installation and deep clean", stageIndex: 4, priority: "high" },
    ]
  }
];

const STORAGE_PREFIX = "studio_iksha_workflow_v1";

function loadStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}_${key}`);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error("Storage error:", e);
  }
}

// Get or initialize project workflow data
export function getProjectWorkflow(projectId, project = null) {
  if (!projectId) return null;
  const data = loadStorage(`project_${projectId}`, null);
  if (data) {
    // If project clientName exists now, ensure clientAssigned is true
    if (project?.clientName && project?.clientName !== "Unassigned Client" && !data.clientAssigned) {
      data.clientAssigned = true;
      saveStorage(`project_${projectId}`, data);
    }
    return data;
  }

  // Initialize fresh project workflow state
  const isAssigned = Boolean(project?.clientName && project?.clientName !== "Unassigned Client" && !project?.telegramSetupPending);
  const initial = {
    projectId,
    templateId: null,
    templateName: null,
    clientAssigned: isAssigned,
    stages: [],
    tasks: [],
    drive: {
      folderUrl: "",
      links: [
        { id: "drive-drawings", name: "📐 Architectural CAD & 2D Drawings", category: "Drawings", url: "" },
        { id: "drive-3d", name: "🎨 3D Renders & Visual Presentations", category: "Renders", url: "" },
        { id: "drive-boq", name: "📑 Bill of Quantities & Material BoQ", category: "Documents", url: "" },
        { id: "drive-site", name: "📸 Site Progress Photos & Inspections", category: "Site Photos", url: "" }
      ]
    },
    memberAccess: {},
    createdAt: new Date().toISOString()
  };

  saveStorage(`project_${projectId}`, initial);
  return initial;
}

export function updateProjectWorkflow(projectId, updates) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
  saveStorage(`project_${projectId}`, updated);
  return updated;
}

// Apply a template to a project
export function applyWorkflowTemplate(projectId, templateId, startDate = null) {
  const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId) || WORKFLOW_TEMPLATES[0];
  const current = getProjectWorkflow(projectId);

  const stages = template.stages.map((stage, idx) => ({
    ...stage,
    id: `stage-${projectId}-${idx + 1}`,
    status: idx === 0 ? "in_progress" : "upcoming"
  }));

  const tasks = template.starterTasks.map((t, idx) => ({
    id: `task-${projectId}-${idx + 1}`,
    projectId,
    stageId: stages[t.stageIndex]?.id || stages[0].id,
    stageName: stages[t.stageIndex]?.name || stages[0].name,
    title: t.title,
    description: `Standard deliverable for ${stages[t.stageIndex]?.name || "project stage"}.`,
    status: "todo",
    priority: t.priority || "normal",
    assigneeName: "Lead Designer",
    assigneeId: null,
    dueDate: computeTaskDueDate(startDate || new Date().toISOString(), t.stageIndex, stages),
    createdAt: new Date().toISOString(),
    thread: [
      {
        id: `c-${Date.now()}-${idx}`,
        author: "Studio Iksha",
        text: `Task initiated as part of ${template.name}.`,
        at: new Date().toISOString()
      }
    ]
  }));

  const updated = updateProjectWorkflow(projectId, {
    templateId: template.id,
    templateName: template.name,
    stages,
    tasks
  });

  return updated;
}

function computeTaskDueDate(startDateStr, stageIndex, stages) {
  try {
    const base = new Date(startDateStr);
    let daysOffset = 0;
    for (let i = 0; i <= stageIndex; i++) {
      daysOffset += stages[i]?.durationDays || 5;
    }
    const due = new Date(base.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    return due.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

// Compute stage start and end dates based on project start date
export function computeStageSchedule(startDateStr, stages = []) {
  if (!stages || !stages.length) return [];
  // Accept both date-only starts and the ISO createdAt fallback. Use UTC so
  // deadlines do not shift a day when the browser is in another timezone.
  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };
  let cursor = parseDate(startDateStr) || new Date();

  return stages.map((stage) => {
    const start = parseDate(stage.startDate) || cursor;
    const duration = Number(stage.durationDays);
    const end = parseDate(stage.deadline || stage.endDate) ||
      new Date(start.getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 1) * 86400000);
    cursor = end;
    const label = (date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    return {
      ...stage,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      startLabel: label(start),
      endLabel: label(end)
    };
  });
}

// Tasks Management API
export function addTask(projectId, taskData) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const newTask = {
    id: `task-${projectId}-${Date.now()}`,
    projectId,
    stageId: taskData.stageId || current.stages[0]?.id || "general",
    stageName: current.stages.find((s) => s.id === taskData.stageId)?.name || "General",
    title: taskData.title?.trim() || "Untitled task",
    description: taskData.description?.trim() || "",
    status: taskData.status || "todo",
    priority: taskData.priority || "normal",
    assigneeName: taskData.assigneeName || "Unassigned",
    assigneeId: taskData.assigneeId || null,
    dueDate: taskData.dueDate || "",
    sourceQueryId: taskData.sourceQueryId || null,
    createdAt: new Date().toISOString(),
    thread: taskData.initialComment ? [
      {
        id: `c-${Date.now()}`,
        author: taskData.creatorName || "Founder",
        text: taskData.initialComment,
        at: new Date().toISOString()
      }
    ] : []
  };

  const tasks = [newTask, ...(current.tasks || [])];
  updateProjectWorkflow(projectId, { tasks });
  return newTask;
}

export function updateTask(projectId, taskId, updates) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const tasks = (current.tasks || []).map((t) => {
    if (t.id === taskId) {
      return { ...t, ...updates, updatedAt: new Date().toISOString() };
    }
    return t;
  });

  updateProjectWorkflow(projectId, { tasks });
  return tasks.find((t) => t.id === taskId);
}

export function deleteTask(projectId, taskId) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;
  const tasks = (current.tasks || []).filter((t) => t.id !== taskId);
  updateProjectWorkflow(projectId, { tasks });
  return true;
}

export function addTaskComment(projectId, taskId, author, text) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const newComment = {
    id: `comment-${Date.now()}`,
    author: author || "Founder",
    text: text.trim(),
    at: new Date().toISOString()
  };

  const tasks = (current.tasks || []).map((t) => {
    if (t.id === taskId) {
      const thread = [...(t.thread || []), newComment];
      return { ...t, thread };
    }
    return t;
  });

  updateProjectWorkflow(projectId, { tasks });
  return newComment;
}

// Stage Reordering and Duration Editing
export function updateStageDuration(projectId, stageId, newDurationDays) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const days = Math.max(1, parseInt(newDurationDays, 10) || 1);
  const stages = (current.stages || []).map((s) => s.id === stageId ? { ...s, durationDays: days } : s);
  return updateProjectWorkflow(projectId, { stages });
}

export function reorderStage(projectId, stageId, direction) {
  const current = getProjectWorkflow(projectId);
  if (!current || !current.stages) return null;

  const list = [...current.stages];
  const idx = list.findIndex((s) => s.id === stageId);
  if (idx < 0) return null;

  if (direction === "up" && idx > 0) {
    const temp = list[idx - 1];
    list[idx - 1] = list[idx];
    list[idx] = temp;
  } else if (direction === "down" && idx < list.length - 1) {
    const temp = list[idx + 1];
    list[idx + 1] = list[idx];
    list[idx] = temp;
  }

  const updatedStages = list.map((item, index) => ({ ...item, order: index + 1 }));
  return updateProjectWorkflow(projectId, { stages: updatedStages });
}

// Drive Integration
export function updateDriveSettings(projectId, folderUrl, links = null) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const drive = {
    ...current.drive,
    folderUrl: folderUrl !== undefined ? folderUrl : current.drive?.folderUrl || "",
    links: links || current.drive?.links || []
  };

  return updateProjectWorkflow(projectId, { drive });
}

export function addDriveLink(projectId, name, category, url) {
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const newLink = {
    id: `drive-${Date.now()}`,
    name: name.trim(),
    category: category || "General",
    url: url.trim(),
    addedAt: new Date().toISOString()
  };

  const links = [...(current.drive?.links || []), newLink];
  return updateDriveSettings(projectId, current.drive?.folderUrl, links);
}

// Team Drive Access Controls
export function setMemberDriveAccess(projectId, memberId, level) {
  // level: 'viewer' | 'editor' | 'none'
  const current = getProjectWorkflow(projectId);
  if (!current) return null;

  const memberAccess = {
    ...(current.memberAccess || {}),
    [memberId]: {
      driveAccess: level,
      updatedAt: new Date().toISOString()
    }
  };

  return updateProjectWorkflow(projectId, { memberAccess });
}

// Query State & Conversion to Task Tracking
export function getQueryMeta(queryId) {
  return loadStorage(`query_meta_${queryId}`, {
    status: "pending", // 'pending' | 'discussing' | 'finalized' | 'published' | 'converted'
    draftResponse: "",
    convertedTaskId: null,
    internalNotes: []
  });
}

export function updateQueryMeta(queryId, updates) {
  const current = getQueryMeta(queryId);
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
  saveStorage(`query_meta_${queryId}`, updated);
  return updated;
}

export function addQueryInternalNote(queryId, author, text) {
  const current = getQueryMeta(queryId);
  const note = {
    id: `qnote-${Date.now()}`,
    author: author || "Founder",
    text: text.trim(),
    at: new Date().toISOString()
  };
  const internalNotes = [...(current.internalNotes || []), note];
  return updateQueryMeta(queryId, { internalNotes, status: current.status === "pending" ? "discussing" : current.status });
}

// Unread Notifications Store
export function markItemRead(type, id) {
  const readMap = loadStorage("read_items", {});
  readMap[`${type}_${id}`] = Date.now();
  saveStorage("read_items", readMap);
}

export function isItemRead(type, id, itemDate) {
  if (!itemDate) return true;
  const readMap = loadStorage("read_items", {});
  const readAt = readMap[`${type}_${id}`];
  if (!readAt) return false;
  return readAt >= new Date(itemDate).getTime();
}
