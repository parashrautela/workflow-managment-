// frontend/src/lib/api.js
// Shared API helper and data layer for Studio Iksha Pilot Operations

export class ApiError extends Error {
  constructor(message, status = 400, data = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Core HTTP fetch wrapper with same-origin credentials and JSON payload support
 */
export async function request(url, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const fetchOptions = {
    credentials: "same-origin",
    ...options,
    method,
    headers
  };

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (netErr) {
    throw new ApiError(netErr.message || "Network connection failure. Please check your connection.", 0);
  }

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    
    // 401 Session expired or missing
    if (response.status === 401) {
      if (!url.endsWith("/login") && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("studio-iksha:unauthorized", { detail: { url } }));
      }
      throw new ApiError(errorMsg, 401, data);
    }

    // 403 Forbidden / Permission denied
    if (response.status === 403) {
      throw new ApiError(errorMsg || "Restricted action: You do not have permission to perform this update.", 403, data);
    }

    // 404 Not Found
    if (response.status === 404) {
      throw new ApiError(errorMsg || "Record or access is no longer available in your workspace.", 404, data);
    }

    // 409 Conflict
    if (response.status === 409) {
      throw new ApiError(errorMsg || "Conflict with current project or task state.", 409, data);
    }

    // 429 Rate limited
    if (response.status === 429) {
      throw new ApiError("Too many requests from this address. Please wait a moment before trying again.", 429, data);
    }

    // 502 / Upstream failures
    if (response.status === 502) {
      throw new ApiError(errorMsg || "Upstream delivery error from external service (Telegram/Bot).", 502, data);
    }

    throw new ApiError(errorMsg, response.status, data);
  }

  return data;
}

export const get = (url, options = {}) => request(url, { method: "GET", ...options });
export const post = (url, body, options = {}) => request(url, { method: "POST", body, ...options });
export const patch = (url, body, options = {}) => request(url, { method: "PATCH", body, ...options });
export const del = (url, options = {}) => request(url, { method: "DELETE", ...options });

// Generate unique idempotency key for requests
export function generateIdempotencyKey(prefix = "reply") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -------------------------------------------------------------
// Fallback Pilot Workflow Templates (matching backend/pilot.js)
// -------------------------------------------------------------
export const DEFAULT_PILOT_WORKFLOWS = [
  {
    id: "PILOT-DESIGN-V1",
    name: "Design pilot",
    category: "Design",
    estimatedDays: 6,
    stages: [
      { id: "stage-resources", name: "Resources", durationDays: 1, tasks: ["Collect site plans and client references"] },
      { id: "stage-design", name: "Design", durationDays: 3, tasks: ["Prepare concept and review with client"] },
      { id: "stage-delivery", name: "Delivery", durationDays: 2, tasks: ["Deliver approved drawings"] }
    ]
  },
  {
    id: "PILOT-PAINTING-V1",
    name: "Painting pilot",
    category: "Finishing",
    estimatedDays: 6,
    stages: [
      { id: "stage-paint-resources", name: "Resources", durationDays: 1, tasks: ["Collect site photos and measurements"] },
      { id: "stage-prep", name: "Preparation", durationDays: 2, tasks: ["Prepare walls and approve colour sample"] },
      { id: "stage-paint", name: "Painting", durationDays: 3, tasks: ["Apply coats and inspect finish"] }
    ]
  }
];

// -------------------------------------------------------------
// Phase 2: Workflow & Client API Operations
// -------------------------------------------------------------

/**
 * Fetch available workflow templates (GET /api/{founder|employee}/workflows)
 */
export async function fetchWorkflows(namespace = "founder") {
  try {
    const data = await get(`/api/${namespace}/workflows`);
    if (data.workflows && data.workflows.length > 0) {
      return data.workflows;
    }
  } catch (err) {
    // If backend PR #5 not yet merged/deployed locally, use default pilot templates
    if (err.status === 404) {
      return DEFAULT_PILOT_WORKFLOWS;
    }
    throw err;
  }
  return DEFAULT_PILOT_WORKFLOWS;
}

/**
 * Assign client name and Telegram User ID (POST /api/founder/projects/:id/client)
 */
export async function assignClient(projectId, { clientName, clientTelegramId = "" }) {
  try {
    return await post(`/api/founder/projects/${projectId}/client`, {
      clientName: clientName.trim(),
      clientTelegramId: clientTelegramId.trim()
    });
  } catch (err) {
    // Fallback for pre-PR5 running server: PATCH project clientName
    if (err.status === 404) {
      const res = await patch(`/api/founder/projects/${projectId}`, { clientName: clientName.trim() });
      return { project: res.project || res };
    }
    throw err;
  }
}

/**
 * Start project workflow pipeline (POST /api/founder/projects/:id/workflow/start)
 */
export async function startWorkflow(projectId, { workflowId, startDate, assigneeId }) {
  return await post(`/api/founder/projects/${projectId}/workflow/start`, {
    workflowId,
    startDate: startDate || undefined,
    assigneeId: assigneeId || undefined
  });
}

/**
 * Fetch complete project workspace (GET /api/{founder|employee}/projects/:id/workspace)
 */
export async function fetchProjectWorkspace(projectId, namespace = "founder") {
  return await get(`/api/${namespace}/projects/${projectId}/workspace`);
}

// -------------------------------------------------------------
// Phase 3: Tasks and Task Messages API Operations
// -------------------------------------------------------------

/**
 * List tasks for a project (GET /api/{founder|employee}/projects/:id/tasks)
 */
export async function fetchTasks(projectId, namespace = "founder") {
  return await get(`/api/${namespace}/projects/${projectId}/tasks`);
}

/**
 * Create task (POST /api/founder/projects/:id/tasks) - Founder only
 */
export async function createTask(projectId, taskData) {
  return await post(`/api/founder/projects/${projectId}/tasks`, {
    title: taskData.title.trim(),
    description: taskData.description ? taskData.description.trim() : "",
    assigneeId: taskData.assigneeId !== undefined ? taskData.assigneeId : undefined,
    deadline: taskData.deadline || undefined,
    stageId: taskData.stageId || undefined,
    status: taskData.status || "Open"
  });
}

/**
 * Get single task details (GET /api/{founder|employee}/tasks/:id)
 */
export async function fetchTask(taskId, namespace = "founder") {
  return await get(`/api/${namespace}/tasks/${taskId}`);
}

/**
 * Update task (PATCH /api/{founder|employee}/tasks/:id)
 */
export async function updateTask(taskId, updates, namespace = "founder") {
  return await patch(`/api/${namespace}/tasks/${taskId}`, updates);
}

/**
 * Delete task (DELETE /api/founder/tasks/:id) - Founder only soft delete
 */
export async function deleteTask(taskId) {
  return await del(`/api/founder/tasks/${taskId}`);
}

/**
 * Fetch task messages (GET /api/{founder|employee}/tasks/:id/messages?after=...&limit=100)
 */
export async function fetchTaskMessages(taskId, after = "", limit = 100, namespace = "founder") {
  const query = new URLSearchParams();
  if (after) query.set("after", after);
  if (limit) query.set("limit", String(limit));
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return await get(`/api/${namespace}/tasks/${taskId}/messages${queryString}`);
}

/**
 * Send message to task thread (POST /api/{founder|employee}/tasks/:id/messages)
 */
export async function sendTaskMessage(taskId, { text, attachmentUrl = "" }, namespace = "founder") {
  return await post(`/api/${namespace}/tasks/${taskId}/messages`, {
    text: text.trim(),
    attachmentUrl: attachmentUrl.trim() || undefined
  });
}

/**
 * Mark read cursor for task (POST /api/{founder|employee}/tasks/:id/read)
 */
export async function markTaskRead(taskId, lastMessageId, namespace = "founder") {
  if (!lastMessageId) return { ok: true };
  return await post(`/api/${namespace}/tasks/${taskId}/read`, { lastMessageId });
}

// -------------------------------------------------------------
// Phases 4, 5, 6: Client Queries (Decision Requests) Operations
// -------------------------------------------------------------

/**
 * List client queries (GET /api/{founder|employee}/decision-requests)
 */
export async function fetchDecisionRequests(namespace = "founder") {
  return await get(`/api/${namespace}/decision-requests`);
}

/**
 * Get single client query details (GET /api/{founder|employee}/decision-requests/:id)
 */
export async function fetchDecisionRequest(requestId, namespace = "founder") {
  return await get(`/api/${namespace}/decision-requests/${encodeURIComponent(requestId)}`);
}

/**
 * Add private internal comment (POST /api/{founder|employee}/decision-requests/:id/comment)
 */
export async function addDecisionComment(requestId, text, namespace = "founder") {
  return await post(`/api/${namespace}/decision-requests/${encodeURIComponent(requestId)}/comment`, {
    text: text.trim()
  });
}

/**
 * Approve query (POST /api/founder/decision-requests/:id/approve) - Founder only
 */
export async function approveDecisionRequest(requestId) {
  return await post(`/api/founder/decision-requests/${encodeURIComponent(requestId)}/approve`, {});
}

/**
 * Reject query (POST /api/founder/decision-requests/:id/reject) - Founder only
 */
export async function rejectDecisionRequest(requestId, reason) {
  return await post(`/api/founder/decision-requests/${encodeURIComponent(requestId)}/reject`, {
    reason: reason.trim()
  });
}

/**
 * Convert query to task (POST /api/founder/decision-requests/:id/convert) - Founder only
 */
export async function convertDecisionRequest(requestId, taskFields) {
  return await post(`/api/founder/decision-requests/${encodeURIComponent(requestId)}/convert`, taskFields);
}

/**
 * Publish final reply to Telegram (POST /api/founder/decision-requests/:id/publish) - Founder only
 */
export async function publishDecisionReply(requestId, { response, idempotencyKey }) {
  const key = idempotencyKey || generateIdempotencyKey(`reply-${requestId}`);
  return await post(`/api/founder/decision-requests/${encodeURIComponent(requestId)}/publish`, {
    response: response.trim(),
    idempotencyKey: key
  });
}

/**
 * Authenticated media/attachment URL for Telegram photos & documents
 */
export function getAttachmentUrl(requestId, index = 0, namespace = "founder") {
  return `/api/${namespace}/decision-requests/${encodeURIComponent(requestId)}/attachments/${index}`;
}

// -------------------------------------------------------------
// Phase 8: Access & Revocation Operations
// -------------------------------------------------------------

/**
 * Remove project member (DELETE /api/founder/projects/:id/members/:memberId)
 */
export async function removeProjectMember(projectId, memberId) {
  return await del(`/api/founder/projects/${projectId}/members/${memberId}`);
}

/**
 * Disable employee account (POST /api/founder/employees/:employeeId/disable)
 */
export async function disableEmployee(employeeId) {
  return await post(`/api/founder/employees/${employeeId}/disable`, {});
}
