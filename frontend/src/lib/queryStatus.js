export const needsQueryAttention = (request) =>
  !request.decisionStatus &&
  !["On hold", "Done", "Rejected", "Published", "Approved"].includes(request.status);
