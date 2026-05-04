import { listServers } from '../servers/servers.service.js';
import { countAuthEvents, distinctUsernames, listRecentAuthEvents } from '../events/events.service.js';

export async function buildAdminMetrics() {
  const [servers, loginCount, registerCount, usernames, recentEvents] = await Promise.all([
    listServers().catch(() => []),
    countAuthEvents('login'),
    countAuthEvents('register'),
    distinctUsernames(),
    listRecentAuthEvents(25),
  ]);

  return {
    totals: {
      servers: servers.length,
      logins: loginCount,
      registrations: registerCount,
      users: usernames.length,
    },
    servers,
    recentEvents,
  };
}
