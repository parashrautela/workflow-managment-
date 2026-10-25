// Decision updates reply to the source query. Internal comments never enter this text.
export function queryUpdateText(action, task, result = {}) {
  const name = task?.title ? ` “${task.title}”` : '';
  if (action === 'hold') return `Your query is on hold while we wait for more information. Please share any details needed to continue.`;
  if (action === 'resume') return 'Your query is back under review.';
  if (action === 'reject') return "We're not able to go ahead with this request right now.";
  if (action === 'complete') return `Your query has been accepted.${name || " The work"} is now complete.`;
  if (action === 'delay') {
    const moved = result.affected?.find(row => row.moved);
    return `Your query has been accepted. The work${name} has been delayed${moved?.forecastEnd ? `; the revised completion date is ${moved.forecastEnd}` : ''}.`;
  }
  if (action === 'redo') return `Your query has been accepted. We will redo the work${name}.`;
  if (action === 'attach') return `Your update has been noted against${name || ' the task'}.`;
  return 'Your query has been accepted and added to the work plan.';
}

export function createQueryNotifier({ save, checkpoint, callBotBridge, sendUpdate = payload => callBotBridge('/api/integrations/web/decisions/notify', payload) }) {
  return async (request, project, action, message) => {
    const notifications = request.notifications ||= [];
    const entry = { id: crypto.randomUUID(), action, text: message, status: 'Sending', at: new Date().toISOString() };
    notifications.push(entry);
    if (project.telegramGroupChatId !== request.groupChatId) {
      entry.status = 'Failed'; entry.error = 'The linked Telegram group has changed.';
      await save(); checkpoint(); return;
    }
    // Persist before delivery so a timeout or restart cannot trigger a duplicate.
    await save(); checkpoint();
    try {
      const result = await sendUpdate({
        requestId: request.id, groupChatId: request.groupChatId,
        notificationId: entry.id, response: entry.text, sourceMessageId: request.sourceMessageId,
      });
      entry.status = result.ok && Number.isSafeInteger(result.result?.message_id) && result.result.message_id > 0
        ? 'Sent' : result.deliveryStatus === 'Failed' ? 'Failed' : 'Unknown';
      entry.messageId = result.result?.message_id;
      if (entry.status !== 'Sent') entry.error = entry.status === 'Failed' ? 'Telegram rejected the update.' : 'Delivery is uncertain. Check Telegram before sending again.';
    } catch (error) {
      entry.status = error.botStatus && error.botStatus < 500 ? 'Failed' : 'Unknown';
      entry.error = entry.status === 'Failed' ? 'Telegram did not accept the update.' : 'Delivery is uncertain. Check Telegram before sending again.';
    }
    await save(); checkpoint();
  };
}
