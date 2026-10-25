import { randomUUID, createHash } from "node:crypto";
import { ApiError } from "./api-error.js";
import { pushQueryMessage } from "./pilot.js";

const fail = (message, status = 400) => {
  throw new ApiError(message, status);
};
const closed = (project) => ["Completed", "Abandoned"].includes(project.status);
export const unattended = (request) =>
  request.requestType !== "Message" &&
  !request.decisionStatus &&
  !["On hold", "Done", "Rejected", "Published", "Approved"].includes(
    request.status,
  );
export function projectPeople(state, project) {
  const group = state.telegramGroups.find(
    (row) => row.groupChatId === project.telegramGroupChatId,
  );
  const people = (group?.members || [])
    .filter((row) => row.membershipStatus === "Active")
    .map((row) => ({
      id: String(row.telegramUserId),
      name: row.assignedName || row.telegramName,
      role: row.assignedRole || "Member",
    }));
  for (const member of (project.members || []).filter(
    (row) => row.active !== false,
  )) {
    if (
      !people.some(
        (row) =>
          row.id ===
          String(
            member.telegramUserId ||
              `employee:${member.employeeId || member.id}`,
          ),
      )
    )
      people.push({
        id: String(
          member.telegramUserId || `employee:${member.employeeId || member.id}`,
        ),
        name: member.name,
        role: member.role || member.designation || "Member",
      });
  }
  return people
    .filter(
      (person) =>
        !state.employees.some(
          (employee) =>
            employee.active === false &&
            (String(employee.telegramUserId) === person.id ||
              `employee:${employee.id}` === person.id),
        ) &&
        !group?.members?.some(
          (member) =>
            String(member.telegramUserId) === person.id &&
            member.membershipStatus !== "Active",
        ),
    )
    .map((person) => ({
      ...person,
      connected: Boolean(
        state.telegramConnections?.some(
          (row) => row.telegramUserId === person.id,
        ) ||
        state.employees.some(
          (row) =>
            String(row.telegramUserId) === person.id &&
            row.active !== false &&
            row.telegramConnectedAt,
        ),
      ),
    }));
}
export function upstreamResources(state, task) {
  const seen = new Set([task.id]),
    predecessors = [];
  const visit = (row) => {
    const edges =
      row.planPredecessors ||
      (row.planPredecessorId
        ? [{ taskId: row.planPredecessorId }]
        : row.dependencies || []);
    for (const edge of edges) {
      const previous = state.tasks.find(
        (candidate) =>
          candidate.projectId === task.projectId &&
          !candidate.deletedAt &&
          (candidate.id === edge.taskId ||
            candidate.telegramTaskId ===
              (edge.predecessorTelegramTaskId || edge.taskId)),
      );
      if (!previous || seen.has(previous.id)) continue;
      seen.add(previous.id);
      predecessors.push(previous);
      visit(previous);
    }
  };
  visit(task);
  return predecessors
    .map((previous) => ({
      task: { id: previous.id, title: previous.title, status: previous.status },
      messages: state.taskMessages
        .filter(
          (message) =>
            message.taskId === previous.id &&
            (message.attachmentUrl ||
              message.files?.length ||
              message.attachments?.length ||
              message.isResource),
        )
        .map((message) => ({ ...message, text: message.text || "" })),
    }))
    .filter((row) => row.messages.length);
}
export function validateUpload(input) {
  const types = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (
    !input ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 180 ||
    /[\x00-\x1f/\\]/.test(input.name) ||
    !types.includes(input.type) ||
    typeof input.data !== "string" ||
    input.data.length > 7_000_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)
  )
    fail("Choose a JPEG, PNG, WebP or PDF up to 5 MB.");
  const bytes = Buffer.from(input.data, "base64");
  if (
    !bytes.length ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes.toString("base64") !== input.data
  )
    fail("Choose a file up to 5 MB.");
  const valid =
    input.type === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : input.type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : input.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid) fail("File content does not match its type.");
  return bytes;
}
export function createCollaborationRoutes({
  getState,
  founder,
  employeeSession,
  body,
  json,
  save,
  audit,
  callBotBridge,
  stateStore,
  checkpoint = () => {},
}) {
  return async (req, res, url) => {
    const match = url.pathname.match(
      /^\/api\/(founder|employee)\/(tasks\/([^/]+)\/(files|resources|participants|messages)(?:\/([^/]+)\/publish)?|files\/([^/]+)\/content|decision-requests\/([^/]+)\/(hold|resume))$/,
    );
    if (!match) return false;
    // Existing message GET pagination is served by the pilot routes.
    if (match[4] === "messages" && !match[5] && req.method === "GET")
      return false;
    const state = getState();
    const session = match[1] === "founder" ? founder(req) : null;
    const account =
      session &&
      state.googleAccounts.find((row) => row.id === session.googleAccountId);
    const user = session
      ? { id: "founder", name: account?.name || "Founder", founder: true }
      : match[1] === "employee"
        ? employeeSession(req)
        : null;
    if (!user) fail("Sign-in required.", 401);
    const file = match[6] && state.taskFiles.find((row) => row.id === match[6]);
    const request =
      match[7] &&
      state.decisionRequests.find(
        (row) => row.id === decodeURIComponent(match[7]),
      );
    const task =
      (match[3] || file?.taskId) &&
      state.tasks.find(
        (row) => row.id === (match[3] || file.taskId) && !row.deletedAt,
      );
    const project = state.projects.find(
      (row) =>
        row.id === (task?.projectId || request?.projectId) &&
        (user.founder ||
          row.members?.some(
            (member) =>
              member.employeeId === user.id && member.active !== false,
          )),
    );
    if (!project) fail("Project or item not found in your workspace.", 404);
    if (match[6] && req.method === "GET") {
      const bytes = await stateStore
        .getAttachment(file.id)
        .catch(() => fail("File is unavailable.", 404));
      res.writeHead(200, {
        "content-type": file.type,
        "content-length": bytes.length,
        "cache-control": "private, no-store",
        "content-disposition": `${file.type.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      });
      res.end(bytes);
      return true;
    }
    if (match[4] === "resources" && req.method === "GET") {
      json(res, 200, { resources: upstreamResources(state, task) });
      return true;
    }
    if (match[4] === "participants" && req.method === "GET") {
      json(res, 200, { people: projectPeople(state, project) });
      return true;
    }
    if (req.method !== "POST") fail("Method not allowed.", 405);
    if (closed(project)) fail("This project is closed.", 409);
    if (match[8]) {
      if (!user.founder) fail("Founder permission required.", 403);
      if (match[8] === "resume") {
        if (request.status !== "On hold")
          fail("Only a held query can return to review.", 409);
        request.status = "Pending";
        request.decisionStatus = "";
        request.resumedAt = new Date().toISOString();
      } else {
        if (!unattended(request))
          fail("This query has already been handled.", 409);
        const input = await body(req);
        const target = state.tasks.find(
          (row) =>
            row.id === input.taskId &&
            row.projectId === project.id &&
            !row.deletedAt,
        );
        if (!target) fail("Choose a task in this project.");
        Object.assign(request, {
          taskId: target.id,
          status: "On hold",
          decisionStatus: "Held",
          heldAt: new Date().toISOString(),
          reviewedAt: new Date().toISOString(),
        });
        pushQueryMessage(state, target, request);
      }
      audit("query_" + match[8], project.id, {
        requestId: request.id,
        taskId: request.taskId,
      });
      await save();
      json(res, 200, { request });
      return true;
    }
    if (["Completed", "Cancelled"].includes(task.status) && !match[5])
      fail("This task is closed. Ask a founder to reopen it.", 409);
    if (match[4] === "files") {
      const input = await body(req, 7_100_000),
        bytes = validateUpload(input);
      const files = state.taskFiles.filter((row) => row.taskId === task.id);
      if (
        files.reduce((sum, row) => sum + row.size, 0) + bytes.length >
        100 * 1024 * 1024
      )
        fail("This task has reached its 100 MB attachment limit.", 409);
      const uploaded = {
        id: randomUUID(),
        taskId: task.id,
        projectId: project.id,
        name: input.name.trim(),
        type: input.type,
        size: bytes.length,
        authorId: user.id,
        at: new Date().toISOString(),
      };
      await stateStore.putAttachment(uploaded.id, bytes);
      state.taskFiles.push(uploaded);
      await save();
      json(res, 201, { file: uploaded });
      return true;
    }
    let message;
    if (!match[5]) {
      const input = await body(req);
      const value = typeof input.text === "string" ? input.text.trim() : "";
      let link = "";
      if (input.attachmentUrl) {
        try {
          const parsed = new URL(input.attachmentUrl);
          if (
            parsed.protocol !== "https:" ||
            parsed.username ||
            parsed.password ||
            input.attachmentUrl.length > 2048
          )
            throw Error();
          link = parsed.href;
        } catch {
          fail("Attachment links must use HTTPS without credentials.");
        }
      }
      if (
        !Array.isArray(input.fileIds || []) ||
        (input.fileIds || []).length > 1
      )
        fail("Attach one file per message.");
      const files = (input.fileIds || []).map((id) =>
        state.taskFiles.find(
          (row) =>
            row.id === id && row.taskId === task.id && row.authorId === user.id,
        ),
      );
      if (
        files.some((row) => !row) ||
        value.length > 2000 ||
        (!value && !link && !files.length)
      )
        fail("Enter a message or add a file.");
      const key = input.clientKey || randomUUID();
      if (typeof key !== "string" || !/^[\w-]{8,100}$/.test(key))
        fail("Use a valid message key.");
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            value,
            link,
            input.fileIds || [],
            Boolean(input.isResource),
          ]),
        )
        .digest("hex");
      message = state.taskMessages.find(
        (row) =>
          row.taskId === task.id &&
          row.authorId === user.id &&
          row.clientKey === key,
      );
      if (message && message.fingerprint !== fingerprint)
        fail("This message key was already used.", 409);
      if (!message) {
        message = {
          id: randomUUID(),
          taskId: task.id,
          projectId: project.id,
          authorId: user.id,
          author: user.name,
          text: value,
          attachmentUrl: link,
          files,
          isResource: Boolean(input.isResource),
          clientKey: key,
          fingerprint,
          at: new Date().toISOString(),
        };
        state.taskMessages.push(message);
        audit("task_message", project.id, {
          taskId: task.id,
          messageId: message.id,
          actorId: user.id,
        });
        await save();
      }
      json(res, 201, { message });
      return true;
    }
    if (!user.founder) fail("Only founders can publish to Telegram.", 403);
    message = state.taskMessages.find(
      (row) => row.id === match[5] && row.taskId === task.id,
    );
    if (!message) fail("Message not found.", 404);
    if (message.telegram?.status && message.telegram.status !== "Failed") {
      json(res, 200, { message });
      return true;
    }
    if (!project.telegramGroupChatId) fail("Link a Telegram group first.", 409);
    const input = await body(req),
      people = projectPeople(state, project);
    if (
      input.confirm !== true ||
      !Array.isArray(input.recipientIds) ||
      input.recipientIds.length > 30 ||
      new Set(input.recipientIds).size !== input.recipientIds.length ||
      input.recipientIds.some(
        (id) => !/^\d+$/.test(id) || !people.some((row) => row.id === id),
      )
    )
      fail("Review the group and choose valid project recipients.");
    if (message.queryId || message.attachments?.length)
      fail(
        "Publish a new message with the selected reference file; query messages stay internal.",
        409,
      );
    if (
      `${project.name} — ${task.title}\n\n${message.text}\n${message.attachmentUrl || ""}`
        .length > 3500
    )
      fail("Shorten the message or link before publishing.");
    const files = await Promise.all(
      (message.files || []).map(async (file) => ({
        name: file.name,
        type: file.type,
        data: (await stateStore.getAttachment(file.id)).toString("base64"),
      })),
    );
    message.telegram = {
      status: "Sending",
      recipientIds: input.recipientIds,
      groupChatId: project.telegramGroupChatId,
      at: new Date().toISOString(),
    };
    await save();
    checkpoint();
    try {
      const result = await callBotBridge("/api/integrations/web/task-notice", {
        groupChatId: project.telegramGroupChatId,
        text: `${project.name} — ${task.title}\n\n${message.text}${message.attachmentUrl ? "\n" + message.attachmentUrl : ""}`,
        recipientIds: input.recipientIds,
        files,
      });
      message.telegram.status = "Sent";
      message.telegram.messageIds = result.messageIds;
    } catch (error) {
      message.telegram.status =
        error.botStatus && error.botStatus < 500 ? "Failed" : "Unknown";
      message.telegram.error =
        message.telegram.status === "Failed"
          ? `Not sent: ${error.message}`
          : "Delivery was not confirmed. Check Telegram before any further send.";
    }
    audit("task_message_published", project.id, {
      taskId: task.id,
      messageId: message.id,
      status: message.telegram.status,
    });
    await save();
    json(res, 200, { message });
    return true;
  };
}
