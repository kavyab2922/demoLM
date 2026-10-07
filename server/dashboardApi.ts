/**
 * Read-only HTTP middleware for the Customer Dashboard data API.
 * Mounted by vite.config.ts under /api/dashboard (dev server only).
 *
 * Endpoints (GET only):
 *   /api/dashboard/customers        -> CustomerListItem[]
 *   /api/dashboard/customers/:id    -> DashboardCustomerSummary
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getCustomerStats, listCustomers } from './dashboardData';

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function createDashboardApi(uri: string | undefined): Middleware {
  return (req, res, next) => {
    const method = req.method ?? 'GET';
    const rawPath = (req.url ?? '').split('?')[0];
    // Requests arrive with the vite base (/license-management) prefix; accept both forms.
    const matchPath = rawPath.match(/^(?:\/license-management)?\/api\/dashboard\b/);
    if (!matchPath) {
      next();
      return;
    }

    let trimmed = rawPath.slice(matchPath[0].length).replace(/\/+$/, '');
    if (!trimmed) trimmed = '/';
    if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;

    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (!uri) {
      console.error('[dashboard-api] MONGODB_URI is not configured (set it in .env)');
      sendJson(res, 503, { error: 'Data source is not configured' });
      return;
    }

    void (async () => {
      if (trimmed === '/' || trimmed === '/customers') {
        const customers = await listCustomers(uri);
        sendJson(res, 200, customers);
        return;
      }

      const match = trimmed.match(/^\/customers\/([^/]+)$/);
      if (match) {
        const stats = await getCustomerStats(uri, decodeURIComponent(match[1]));
        if (!stats) {
          sendJson(res, 404, { error: 'Customer not found' });
          return;
        }
        sendJson(res, 200, stats);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    })().catch((err: unknown) => {
      // Never echo the connection string or credentials back to the client.
      console.error('[dashboard-api] request failed:', err instanceof Error ? err.message : err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Failed to load dashboard data' });
    });
  };
}
