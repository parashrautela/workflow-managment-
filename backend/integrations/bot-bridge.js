export function createBotBridge({ baseUrl, secret }) {
  return async function callBotBridge(route, payload) {
    if (!baseUrl || !secret) throw new Error('Bot integration is not configured.');
    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(
        route.endsWith('/content') ? 45_000 : route.endsWith('/task-notice') ? 60_000 : 30_000,
      ),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(data.error || 'Telegram bot did not accept the update.'), {
        botStatus: response.status,
        botBody: data,
      });
    return data;
  };
}
