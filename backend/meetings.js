import { randomUUID } from "node:crypto";
import { ApiError } from "./api-error.js";
import { projectPeople } from "./collaboration.js";
const fail = (message, status = 400) => {
  throw new ApiError(message, status);
};
const active = (project) =>
  project && !["Completed", "Abandoned"].includes(project.status);
const stamp = () => new Date().toISOString();
export function reminderTimes(meeting) {
  const start = Date.parse(meeting.startsAt);
  const times = (meeting.reminderMinutes || []).map((minutes) => ({
    key: String(minutes),
    at: new Date(start - minutes * 60000).toISOString(),
  }));
  if (meeting.previousEvening) {
    const indiaDate = new Date(start + 330 * 60000).toISOString().slice(0, 10);
    times.push({
      key: "evening",
      at: new Date(
        Date.parse(`${indiaDate}T18:00:00+05:30`) - 86400000,
      ).toISOString(),
    });
  }
  return times.filter(
    (item, index) => times.findIndex((row) => row.at === item.at) === index,
  );
}
export function validateMeeting(input, people, now = Date.now()) {
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.trim().length > 180 ||
    typeof input.location !== "string" ||
    input.location.length > 300
  )
    fail("Enter a meeting title and location under 301 characters.");
  const start =
    typeof input.startsAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      input.startsAt,
    )
      ? Date.parse(input.startsAt)
      : NaN;
  const date =
    typeof input.startsAt === "string" ? input.startsAt.slice(0, 10) : "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    !Number.isFinite(start) ||
    start <= now ||
    start > now + 730 * 86400000
  )
    fail("Choose a future meeting date within two years.");
  if (
    !Array.isArray(input.attendeeIds) ||
    !input.attendeeIds.length ||
    input.attendeeIds.length > 50 ||
    new Set(input.attendeeIds).size !== input.attendeeIds.length ||
    input.attendeeIds.some((id) => !people.some((person) => person.id === id))
  )
    fail("Select attendees from this project.");
  if (
    !Array.isArray(input.reminderMinutes) ||
    input.reminderMinutes.length > 5 ||
    new Set(input.reminderMinutes).size !== input.reminderMinutes.length ||
    input.reminderMinutes.some(
      (value) => !Number.isInteger(value) || value < 1 || value > 10080,
    ) ||
    typeof input.previousEvening !== "boolean" ||
    typeof input.groupFallback !== "boolean"
  )
    fail(
      "Choose up to five reminder intervals between one minute and seven days.",
    );
  return {
    title: input.title.trim(),
    location: input.location.trim(),
    startsAt: new Date(start).toISOString(),
    attendeeIds: input.attendeeIds,
    reminderMinutes: input.reminderMinutes,
    previousEvening: input.previousEvening,
    groupFallback: input.groupFallback,
    timeZone: "Asia/Kolkata",
  };
}
export function initializeMeetings(state) {
  let changed = false;
  for (const message of state.taskMessages)
    if (message.telegram?.status === "Sending") {
      message.telegram.status = "Unknown";
      message.telegram.error =
        "Service restarted during delivery. Check Telegram before sending again.";
      changed = true;
    }
  for (const delivery of state.meetingDeliveries)
    if (delivery.status === "Sending") {
      delivery.status = "Unknown";
      delivery.error =
        "Service restarted during delivery. Check Telegram before sending again.";
      changed = true;
    }
  return changed;
}
function enqueue(
  state,
  meeting,
  project,
  kind,
  now,
  attendees = meeting.attendeeIds,
) {
  const people = projectPeople(state, project);
  const when = new Date(meeting.startsAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const text = `${kind} — ${project.name}\n${meeting.title}\n${when} IST${meeting.location ? "\nLocation: " + meeting.location : ""}\nAttendees: ${attendees.map((id) => people.find((row) => row.id === id)?.name || id).join(", ")}`;
  for (const id of attendees) {
    const key = `${meeting.id}:${meeting.revision}:${kind}:${id}`;
    if (state.meetingDeliveries.some((row) => row.key === key)) continue;
    state.meetingDeliveries.push({
      id: randomUUID(),
      key,
      meetingId: meeting.id,
      projectId: project.id,
      revision: meeting.revision,
      kind,
      attendeeId: id,
      text,
      dueAt: now,
      status: "Pending",
      groupFallback: meeting.groupFallback,
      createdAt: stamp(),
    });
  }
}
export function createMeetingRoutes({
  getState,
  founder,
  employeeSession,
  body,
  json,
  save,
  audit,
  callBotBridge,
  checkpoint = () => {},
}) {
  const view = (state, meeting, user) => ({
    ...meeting,
    attendees: projectPeople(
      state,
      state.projects.find((row) => row.id === meeting.projectId),
    ).filter((row) => meeting.attendeeIds.includes(row.id)),
    deliveries: user.founder
      ? state.meetingDeliveries
          .filter((row) => row.meetingId === meeting.id)
          .map(({ text, ...row }) => row)
      : [],
    projectName:
      state.projects.find((row) => row.id === meeting.projectId)?.name || "",
  });
  const route = async (req, res, url) => {
    const match = url.pathname.match(
      /^\/api\/(founder|employee)\/(meetings(?:\/([^/]+))?|tasks\/([^/]+)\/meeting)$/,
    );
    if (!match) return false;
    const state = getState();
    const user =
      match[1] === "founder"
        ? founder(req) && { founder: true }
        : employeeSession(req);
    if (!user) fail("Sign-in required.", 401);
    const visible = (project) =>
      active(project) &&
      (user.founder ||
        project.members?.some(
          (row) => row.employeeId === user.id && row.active !== false,
        ));
    if (req.method === "GET" && !match[3] && !match[4]) {
      json(res, 200, {
        meetings: state.meetings
          .filter(
            (meeting) =>
              state.projects.some(
                (project) =>
                  project.id === meeting.projectId && visible(project),
              ) &&
              (!url.searchParams.get("projectId") ||
                meeting.projectId === url.searchParams.get("projectId")),
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((meeting) => view(state, meeting, user)),
      });
      return true;
    }
    if (!user.founder) fail("Founder permission required.", 403);
    let meeting = match[3] && state.meetings.find((row) => row.id === match[3]);
    const task = state.tasks.find(
      (row) => row.id === (match[4] || meeting?.taskId) && !row.deletedAt,
    );
    const project =
      task &&
      state.projects.find((row) => row.id === task.projectId && active(row));
    if (!project) fail("Active project task not found.", 404);
    const input = await body(req),
      now = stamp();
    if (req.method === "PATCH" && meeting) {
      if (input.revision !== meeting.revision || meeting.status !== "Scheduled")
        fail("Meeting changed. Refresh before editing.", 409);
      const previous = [...meeting.attendeeIds];
      if (["Cancelled", "Completed"].includes(input.status)) {
        meeting.status = input.status;
        meeting.revision++;
        meeting.updatedAt = now;
        if (input.status === "Cancelled")
          enqueue(state, meeting, project, "Meeting cancelled", now);
      } else {
        const fields = validateMeeting(input, projectPeople(state, project));
        Object.assign(meeting, fields, {
          revision: meeting.revision + 1,
          updatedAt: now,
        });
        enqueue(state, meeting, project, "Meeting updated", now);
        const removed = previous.filter(
          (id) => !meeting.attendeeIds.includes(id),
        );
        if (removed.length)
          enqueue(
            state,
            meeting,
            project,
            "Meeting invitation withdrawn",
            now,
            removed,
          );
      }
      // Supersede unsent notifications for the old schedule; retain delivered and uncertain history.
      for (const delivery of state.meetingDeliveries.filter(
        (row) =>
          row.meetingId === meeting.id &&
          row.revision !== meeting.revision &&
          ["Pending", "Unavailable"].includes(row.status),
      ))
        delivery.status = "Superseded";
    } else if (req.method === "POST" && match[4]) {
      if (["Completed", "Cancelled"].includes(task.status))
        fail("Choose an open task for this meeting.", 409);
      if (
        state.meetings.some(
          (row) => row.taskId === task.id && row.status === "Scheduled",
        )
      )
        fail(
          "This task already has a scheduled meeting. Edit it from Meetings.",
          409,
        );
      const fields = validateMeeting(input, projectPeople(state, project));
      meeting = {
        id: randomUUID(),
        taskId: task.id,
        projectId: project.id,
        ...fields,
        status: "Scheduled",
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      state.meetings.push(meeting);
      enqueue(state, meeting, project, "Meeting scheduled", now);
    } else fail("Method not allowed.", 405);
    audit("meeting_" + meeting.status.toLowerCase(), project.id, {
      meetingId: meeting.id,
      taskId: task.id,
      revision: meeting.revision,
    });
    await save();
    json(res, 200, { meeting: view(state, meeting, user) });
    return true;
  };
  route.tick = async (now = new Date()) => {
    const state = getState(),
      time = now.toISOString();
    for (const meeting of state.meetings.filter(
      (row) => row.status === "Scheduled" && row.startsAt > time,
    )) {
      const project = state.projects.find(
        (row) => row.id === meeting.projectId,
      );
      if (
        !active(project) ||
        !state.tasks.some(
          (row) =>
            row.id === meeting.taskId &&
            !row.deletedAt &&
            row.status !== "Cancelled",
        )
      )
        continue;
      for (const reminder of reminderTimes(meeting))
        if (reminder.at <= time && reminder.at >= meeting.updatedAt)
          enqueue(
            state,
            meeting,
            project,
            `Meeting reminder (${reminder.key})`,
            reminder.at,
          );
    }
    await save();
    for (const delivery of state.meetingDeliveries.filter(
      (row) =>
        ["Pending", "Unavailable"].includes(row.status) && row.dueAt <= time,
    )) {
      if (!["Pending", "Unavailable"].includes(delivery.status)) continue;
      const meeting = state.meetings.find(
          (row) => row.id === delivery.meetingId,
        ),
        project = state.projects.find((row) => row.id === delivery.projectId);
      if (
        !meeting ||
        !active(project) ||
        meeting.revision !== delivery.revision
      ) {
        delivery.status = "Superseded";
        continue;
      }
      if (
        meeting.startsAt <= time &&
        !/cancelled|withdrawn/i.test(delivery.kind)
      ) {
        delivery.status = "Skipped";
        delivery.error = "Meeting time has passed.";
        continue;
      }
      if (!project.telegramGroupChatId) {
        delivery.status = "Unavailable";
        delivery.error =
          "Link the project Telegram group before sending meeting notifications.";
        continue;
      }
      const person = projectPeople(state, project).find(
        (row) => row.id === delivery.attendeeId,
      );
      if (!person) {
        delivery.status = "Skipped";
        delivery.error = "Attendee is no longer active in this project.";
        continue;
      }
      if (!/^\d+$/.test(person.id) || !person.connected) {
        if (!delivery.groupFallback || !project.telegramGroupChatId) {
          delivery.status = "Unavailable";
          delivery.error =
            "No personal Telegram connection. Ask this attendee to press Start; group fallback is off.";
          continue;
        }
      }
      delivery.channel =
        person?.connected && /^\d+$/.test(person.id) ? "Personal" : "Group";
      // One group fallback per event prevents a burst of identical group messages.
      const cohort =
        delivery.channel === "Group"
          ? state.meetingDeliveries.filter(
              (row) =>
                row.meetingId === delivery.meetingId &&
                row.revision === delivery.revision &&
                row.kind === delivery.kind &&
                ["Pending", "Unavailable"].includes(row.status) &&
                projectPeople(state, project).some(
                  (person) =>
                    person.id === row.attendeeId &&
                    (!person.connected || !/^\d+$/.test(person.id)),
                ),
            )
          : [delivery];
      for (const item of cohort) {
        item.status = "Sending";
        item.channel = delivery.channel;
        item.error = "";
      }
      await save();
      checkpoint();
      try {
        const result = await callBotBridge(
          "/api/integrations/web/task-notice",
          {
            groupChatId: project.telegramGroupChatId,
            ...(delivery.channel === "Personal"
              ? { personalId: person.id }
              : {}),
            recipientIds: cohort
              .map((row) => row.attendeeId)
              .filter(
                (id) =>
                  /^\d+$/.test(id) &&
                  projectPeople(state, project).some(
                    (person) => person.id === id,
                  ),
              ),
            text: delivery.text,
            files: [],
          },
        );
        for (const item of cohort) {
          item.status = "Sent";
          item.messageIds = result.messageIds;
        }
      } catch {
        for (const item of cohort) {
          item.status = "Unknown";
          item.error =
            "Delivery was not confirmed. Check Telegram before any further send.";
        }
      }
      await save();
    }
    await save();
  };
  return route;
}
