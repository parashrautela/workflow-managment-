export function createProjectFileRoutes({
  getState,
  callBotBridge,
  employeeSession,
  founder,
  json,
}) {
  return async function projectFileRoutes(req, res, url) {
    const state = getState();
    const projectFilesMatch = url.pathname.match(
      /^\/api\/(founder|employee)\/projects\/([^/]+)\/files(?:\/([^/]+))?$/,
    );
    if (req.method === 'GET' && projectFilesMatch) {
      const namespace = projectFilesMatch[1],
        employee = namespace === 'employee' ? employeeSession(req) : null;
      if (namespace === 'founder' ? !founder(req) : !employee) {
        json(res, 401, { error: 'Sign-in required.' });
        return true;
      }
      const project = state.projects.find(
        (item) =>
          item.id === projectFilesMatch[2] &&
          (namespace === 'founder' ||
            item.members.some(
              (member) => member.employeeId === employee.id && member.active !== false,
            )),
      );
      if (!project) {
        json(res, 404, { error: 'Project not found in your workspace.' });
        return true;
      }
      const files = state.projectFiles.filter((item) => item.projectId === project.id);
      if (!projectFilesMatch[3]) {
        json(res, 200, { files: files.map(({ fileId, driveFileId, ...file }) => file) });
        return true;
      }
      const file = files.find(
        (item) => item.id === decodeURIComponent(projectFilesMatch[3]) && item.status === 'Stored',
      );
      if (!file) {
        json(res, 404, { error: 'Stored file not found.' });
        return true;
      }
      let stored;
      try {
        stored = await callBotBridge('/api/integrations/web/resources/content', {
          groupChatId: project.telegramGroupChatId,
          submissionId: file.id,
        });
      } catch (error) {
        json(res, 502, { error: error.message });
        return true;
      }
      if (typeof stored.bytes !== 'string' || stored.bytes.length > 27000000) {
        json(res, 502, { error: 'Stored file exceeds the download limit.' });
        return true;
      }
      const bytes = Buffer.from(stored.bytes, 'base64');
      if (bytes.length > 20000000) {
        json(res, 413, { error: 'Stored file is too large.' });
        return true;
      }
      const mime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimeType)
        ? file.mimeType
        : 'application/octet-stream';
      res.writeHead(200, {
        'content-type': mime,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'; sandbox",
      });
      res.end(bytes);
      return true;
    }
    return false;
  };
}
