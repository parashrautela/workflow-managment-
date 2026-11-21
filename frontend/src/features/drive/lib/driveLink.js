// The folder id in a pasted Drive link (…/folders/<id> or ?id=<id>), or a bare id; '' when there is none.
export function folderIdFrom(value) {
  const text = String(value || '').trim();
  const id = text.match(/\/folders\/([\w-]+)/)?.[1] || text.match(/[?&]id=([\w-]+)/)?.[1] || text;
  return /^[\w-]{10,200}$/.test(id) ? id : '';
}
