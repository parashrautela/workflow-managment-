export const needsQueryAttention = (request) =>
  request.requestType !== "Message" &&
  !request.decisionStatus &&
  !["On hold", "Done", "Rejected", "Published", "Approved"].includes(request.status);

export const queryStatusLabel = (request) => request.requestType === "Message"
  ? "Group message"
  : request.status === "On hold" ? "Waiting for more context" : request.status;
