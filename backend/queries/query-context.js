// Keep the existing response flag; sender roles no longer restrict founder decisions.
export const queryView = (_state, request) => ({ ...request, canReject: true });
