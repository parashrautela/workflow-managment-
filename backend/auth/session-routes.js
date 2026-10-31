export function createSessionRoutes({
  getState,
  clearCookie,
  cookieValue,
  employeeSession,
  employeeView,
  hash,
  json,
  projectView,
  safeEqual,
  save,
}) {
  return async function sessionRoutes(req, res, url) {
    const state = getState();
    if (
      req.method === 'POST' &&
      ['/api/founder/login', '/api/employee/login'].includes(url.pathname)
    ) {
      json(res, 410, { error: 'Password login has been removed. Continue with Google.' });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/founder/logout') {
      const sid = cookieValue(req, 'iksha_founder');
      state.founderSessions = state.founderSessions.filter(
        (session) => !safeEqual(session.idHash, hash(sid)),
      );
      await save();
      json(res, 200, { ok: true }, { 'set-cookie': clearCookie('iksha_founder') });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/employee/logout') {
      const sid = cookieValue(req, 'iksha_employee');
      state.employeeSessions = state.employeeSessions.filter(
        (session) => !safeEqual(session.idHash, hash(sid)),
      );
      await save();
      json(res, 200, { ok: true }, { 'set-cookie': clearCookie('iksha_employee') });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/employee/me') {
      const employee = employeeSession(req);
      if (!employee) {
        json(res, 401, { error: 'Employee sign-in required.' });
        return true;
      }
      const projects = state.projects.filter((project) =>
        project.members?.some(
          (member) => member.employeeId === employee.id && member.active !== false,
        ),
      );
      json(res, 200, {
        employee: employeeView(employee),
        projects: projects.map(projectView),
      });
      return true;
    }
    return false;
  };
}
