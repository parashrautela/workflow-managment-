import test from "node:test";
import assert from "node:assert/strict";
import {
  validateUpload,
  upstreamResources,
  unattended,
  createCollaborationRoutes,
} from "./collaboration.js";
import { purchaseTemplate } from "./operations.js";
test("uploads enforce content type, size, filename and actual file signature", () => {
  const pdf = {
    name: "drawing.pdf",
    type: "application/pdf",
    data: Buffer.from("%PDF-1.7\nreference").toString("base64"),
  };
  assert.equal(validateUpload(pdf).subarray(0, 5).toString(), "%PDF-");
  for (const input of [
    { ...pdf, name: "../private.pdf" },
    { ...pdf, type: "image/svg+xml" },
    {
      ...pdf,
      data: Buffer.from("<script>alert(1)</script>").toString("base64"),
    },
    { ...pdf, data: "%%%" },
    { ...pdf, data: Buffer.alloc(6 * 1024 * 1024).toString("base64") },
  ])
    assert.throws(() => validateUpload(input));
});
test("resource handoff follows only recorded same-project predecessors, deduplicates branches and excludes chat", () => {
  const state = {
    tasks: [
      {
        id: "a",
        projectId: "p",
        title: "Measure wall",
        planPredecessors: [{ taskId: "c" }],
      },
      {
        id: "b",
        projectId: "p",
        title: "Draw",
        planPredecessors: [{ taskId: "a" }, { taskId: "x" }],
      },
      { id: "c", projectId: "p", title: "Site photo" },
      { id: "x", projectId: "private" },
    ],
    taskMessages: [
      { id: "file", taskId: "a", files: [{ id: "pdf" }] },
      { id: "brief", taskId: "c", text: "Wall 4m", isResource: true },
      { id: "chat", taskId: "c", text: "Lunch?" },
      { id: "secret", taskId: "x", isResource: true },
    ],
  };
  const resources = upstreamResources(state, state.tasks[1]);
  assert.deepEqual(
    resources.map((row) => row.task.id),
    ["a", "c"],
  );
  assert.deepEqual(
    resources.flatMap((row) => row.messages.map((message) => message.id)),
    ["file", "brief"],
  );
  state.tasks[2].planPredecessors = [{ taskId: "b" }];
  assert.equal(upstreamResources(state, state.tasks[1]).length, 2);
});
test("handled queries leave the unattended count, while a new incoming query still needs review", () => {
  assert.equal(unattended({ status: "Pending" }), true);
  for (const status of ["On hold", "Published", "Done", "Rejected"])
    assert.equal(unattended({ status }), false);
  assert.equal(
    unattended({ status: "Approved", decisionStatus: "Approved" }),
    false,
  );
  assert.deepEqual(
    purchaseTemplate.stages[0].tasks.map((row) => row.role),
    ["Founder", "Designer", "Client"],
  );
});
test("task publication checkpoints delivery, refuses staff and cannot send twice after uncertainty", async () => {
  const state = {
    googleAccounts: [],
    projects: [
      {
        id: "p",
        name: "House",
        status: "Active",
        telegramGroupChatId: "-1",
        members: [{ employeeId: "e", telegramUserId: "7", name: "Sam" }],
      },
    ],
    telegramGroups: [],
    telegramConnections: [],
    employees: [],
    tasks: [{ id: "t", projectId: "p", title: "Draw", status: "Open" }],
    taskFiles: [],
    taskMessages: [
      { id: "m", taskId: "t", text: "Approved drawing", files: [] },
    ],
  };
  let sends = 0,
    checkpoints = 0;
  const route = createCollaborationRoutes({
    getState: () => state,
    founder: (req) => req.founder,
    employeeSession: () => ({ id: "e" }),
    body: async (req) => req.input,
    json: (res, status, data) => Object.assign(res, { status, data }),
    save: async () => {},
    audit: () => {},
    stateStore: {},
    checkpoint: () => checkpoints++,
    callBotBridge: async () => {
      sends++;
      throw Error("timeout");
    },
  });
  const call = async (namespace, input, founder = true) => {
    const res = {};
    await route(
      { method: "POST", founder, input },
      res,
      new URL(`http://local/api/${namespace}/tasks/t/messages/m/publish`),
    );
    return res;
  };
  await assert.rejects(
    call("employee", { confirm: true, recipientIds: [] }, false),
    (error) => error.status === 403,
  );
  await assert.rejects(
    call("founder", { confirm: true, recipientIds: ["999"] }),
    (error) => error.status === 400,
  );
  await call("founder", { confirm: true, recipientIds: ["7"] });
  await call("founder", { confirm: true, recipientIds: ["7"] });
  assert.equal(sends, 1);
  assert.equal(checkpoints, 1);
  assert.equal(state.taskMessages[0].telegram.status, "Unknown");
});
