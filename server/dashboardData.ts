/**
 * Read-only QA MongoDB data layer for the Customer Dashboard.
 *
 * STRICT RULE: this module may only run read operations
 * (find / aggregate / countDocuments / listCollections / indexes).
 * Never insert, update, delete, $out, $merge, or create indexes.
 *
 * Databases used (all on the QA server):
 *   QA_PM        - customers, projects, users, defects, project_user_role
 *   QA_TM        - testcases
 *   QA_EXECUTIONS - executions
 */
import { MongoClient, type Db } from 'mongodb';

const MAX_PROJECTS_PER_CUSTOMER = 500;
const CUSTOMERS_CACHE_TTL_MS = 60_000;
const STATS_CACHE_TTL_MS = 5 * 60_000;
const TREND_DAYS = 28;
const TREND_BUCKETS = 4;

export interface CustomerListItem {
  id: string;
  name: string;
}

export interface DashboardProjectSummary {
  name: string;
  users: number;
  testCases: number;
  manual: number;
  automated: number;
  executions: number;
  passed: number;
  openDefects: number;
  criticalDefects: number;
}

export interface DashboardCustomerSummary {
  id: string;
  name: string;
  industry: string;
  projects: DashboardProjectSummary[];
  defectStatus: { open: number; fixed: number; closed: number };
  severity: { critical: number; high: number; medium: number; low: number };
  trendTotal: number[];
  trendPassed: number[];
}

type StateBucket = 'open' | 'fixed' | 'closed';
type SeverityBucket = 'critical' | 'high' | 'medium' | 'low';

let clientPromise: Promise<MongoClient> | null = null;
let clientUri = '';

async function getDbs(uri: string): Promise<{ pm: Db; tm: Db; exec: Db }> {
  if (!clientPromise || clientUri !== uri) {
    clientUri = uri;
    clientPromise = new MongoClient(uri, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 }).connect();
  }
  const client = await clientPromise;
  return { pm: client.db('QA_PM'), tm: client.db('QA_TM'), exec: client.db('QA_EXECUTIONS') };
}

/** Custom states/severities are stored as CUSTFIELD_<customerId><label>_<n>_<suffix>. Extract the label. */
function normalizeCustom(value: string): string {
  return value
    .replace(/^CUSTFIELD_\d+/, '')
    .replace(/_\d+_[a-z0-9]+$/i, '')
    .trim();
}

function stateBucket(state: string | null | undefined): StateBucket {
  if (!state) return 'open';
  const s = normalizeCustom(state).toLowerCase();
  if (/closed|complete|done|reject|duplicate|not a defect|not_a_defect|removed/.test(s)) return 'closed';
  if (/fixed|resolved/.test(s)) return 'fixed';
  return 'open';
}

function severityBucket(severity: string | null | undefined): SeverityBucket | null {
  if (!severity) return null;
  const s = normalizeCustom(severity).toLowerCase();
  if (s.includes('critical') || s.includes('blocker') || s.includes('highest') || s === 's1') return 'critical';
  if (s.includes('high') || s.includes('major') || s === 's2') return 'high';
  if (s.includes('medium') || s === 's3') return 'medium';
  if (s.includes('minor') || s.includes('low') || s === 's4') return 'low';
  return null;
}

interface CustomersCacheEntry {
  at: number;
  list: CustomerListItem[];
}

let customersCache: CustomersCacheEntry | null = null;

export async function listCustomers(uri: string): Promise<CustomerListItem[]> {
  if (customersCache && Date.now() - customersCache.at < CUSTOMERS_CACHE_TTL_MS) {
    return customersCache.list;
  }
  const { pm } = await getDbs(uri);

  const projectCounts = await pm
    .collection('project')
    .aggregate<{ _id: number; n: number }>([
      { $match: { deleted: false } },
      { $group: { _id: '$customerId', n: { $sum: 1 } } },
    ])
    .toArray();

  const eligibleIds = projectCounts
    .filter((g) => typeof g._id === 'number' && g.n > 0 && g.n <= MAX_PROJECTS_PER_CUSTOMER)
    .map((g) => g._id);

  const customers = await pm
    .collection('customer')
    .find({ id: { $in: eligibleIds }, deleted: false }, { projection: { id: 1, cust_name: 1 } })
    .toArray();

  const list = customers
    .map((c) => ({
      id: String(c.id),
      name: String(c.cust_name ?? '').trim() || `Customer ${c.id}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  customersCache = { at: Date.now(), list };
  return list;
}

interface StatsCacheEntry {
  at: number;
  data: DashboardCustomerSummary;
}

const statsCache = new Map<string, StatsCacheEntry>();

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getCustomerStats(uri: string, customerId: string): Promise<DashboardCustomerSummary | null> {
  const cid = Number(customerId);
  if (!Number.isFinite(cid) || !Number.isInteger(cid)) return null;

  const cached = statsCache.get(customerId);
  if (cached && Date.now() - cached.at < STATS_CACHE_TTL_MS) return cached.data;

  const { pm, tm, exec } = await getDbs(uri);
  const customer = await pm
    .collection('customer')
    .findOne({ id: cid, deleted: false }, { projection: { id: 1, cust_name: 1 } });
  if (!customer) return null;

  const since = new Date(Date.now() - TREND_DAYS * 86400000);

  // All sub-queries run concurrently and are backed by existing indexes.
  const [projectDocs, usersPerProject, tcRows, defectStateRows, defectSeverityRows, execTotals, execTrend] =
    await Promise.all([
      pm
        .collection('project')
        .find({ customerId: cid, deleted: false }, { projection: { id: 1, name: 1 } })
        .toArray(),
      pm
        .collection('project_user_role')
        .aggregate<{ _id: number; users: number }>([
          { $match: { customerId: cid, deleted: false } },
          { $group: { _id: '$projectId', users: { $sum: 1 } } },
        ])
        .toArray(),
      tm
        .collection('testcase')
        .aggregate<{ _id: { p: number; e: string }; n: number }>([
          { $match: { customerId: cid, deleted: false } },
          { $group: { _id: { p: '$projectId', e: '$executionType' }, n: { $sum: 1 } } },
        ])
        .toArray(),
      pm
        .collection('defect')
        .aggregate<{ _id: { p: number; s: string | null }; n: number }>([
          { $match: { customerId: cid, deleted: false } },
          { $group: { _id: { p: '$projectId', s: '$state' }, n: { $sum: 1 } } },
        ])
        .toArray(),
      pm
        .collection('defect')
        .aggregate<{ _id: { p: number; sev: string | null }; n: number }>([
          { $match: { customerId: cid, deleted: false } },
          { $group: { _id: { p: '$projectId', sev: '$severity' }, n: { $sum: 1 } } },
        ])
        .toArray(),
      exec
        .collection('execution')
        .aggregate<{ _id: { p: number; r: string | null }; n: number }>([
          { $match: { customerId: cid, deleted: false, childExecution: { $ne: true } } },
          { $group: { _id: { p: '$projectId', r: '$result' }, n: { $sum: 1 } } },
        ])
        .toArray(),
      // Daily buckets (UTC) for the last 28 days; folded into 4 weekly buckets below.
      exec
        .collection('execution')
        .aggregate<{ _id: { d: string; r: string | null }; n: number }>([
          { $match: { customerId: cid, deleted: false, childExecution: { $ne: true }, createdAt: { $gte: since } } },
          { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, r: '$result' }, n: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

  const usersMap = new Map<number, number>();
  for (const row of usersPerProject) usersMap.set(row._id, row.users);

  const tcTotalMap = new Map<number, number>();
  const tcAutoMap = new Map<number, number>();
  for (const row of tcRows) {
    const prev = tcTotalMap.get(row._id.p) ?? 0;
    tcTotalMap.set(row._id.p, prev + row.n);
    if (row._id.e === 'AUTOMATION') tcAutoMap.set(row._id.p, (tcAutoMap.get(row._id.p) ?? 0) + row.n);
  }

  const openByProject = new Map<number, number>();
  const statusTotals: Record<StateBucket, number> = { open: 0, fixed: 0, closed: 0 };
  for (const row of defectStateRows) {
    const bucket = stateBucket(row._id.s);
    statusTotals[bucket] += row.n;
    if (bucket === 'open') openByProject.set(row._id.p, (openByProject.get(row._id.p) ?? 0) + row.n);
  }

  const criticalByProject = new Map<number, number>();
  const severityTotals: Record<SeverityBucket, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of defectSeverityRows) {
    const bucket = severityBucket(row._id.sev);
    if (!bucket) continue; // defects without a recognized severity are not shown on the severity chart
    severityTotals[bucket] += row.n;
    if (bucket === 'critical') criticalByProject.set(row._id.p, (criticalByProject.get(row._id.p) ?? 0) + row.n);
  }

  const execTotalMap = new Map<number, number>();
  const execPassedMap = new Map<number, number>();
  for (const row of execTotals) {
    const prev = execTotalMap.get(row._id.p) ?? 0;
    execTotalMap.set(row._id.p, prev + row.n);
    if (row._id.r === 'PASSED') execPassedMap.set(row._id.p, (execPassedMap.get(row._id.p) ?? 0) + row.n);
  }

  // Weekly rolling buckets: index 0 = oldest (days 21-27 ago), index 3 = newest (days 0-6 ago).
  const trendTotal = Array.from({ length: TREND_BUCKETS }, () => 0);
  const trendPassed = Array.from({ length: TREND_BUCKETS }, () => 0);
  const todayMs = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  for (const row of execTrend) {
    const dayMs = Date.parse(`${row._id.d}T00:00:00Z`);
    if (Number.isNaN(dayMs)) continue;
    const daysAgo = Math.floor((todayMs - dayMs) / 86400000);
    const idx = TREND_BUCKETS - 1 - Math.floor(daysAgo / 7);
    if (idx < 0 || idx >= TREND_BUCKETS) continue;
    trendTotal[idx] += row.n;
    if (row._id.r === 'PASSED') trendPassed[idx] += row.n;
  }

  // Unique-ify duplicate project names (the UI keys selects/tables by name).
  const normalizedNames = projectDocs.map(
    (p) => String(p.name ?? '').trim() || `Project ${p._id}`,
  );
  const nameCounts = new Map<string, number>();
  for (const n of normalizedNames) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  const seenNames = new Map<string, number>();

  const projects: DashboardProjectSummary[] = projectDocs.map((p, i) => {
    let name = normalizedNames[i];
    if ((nameCounts.get(name) ?? 0) > 1) {
      const occurrence = (seenNames.get(name) ?? 0) + 1;
      seenNames.set(name, occurrence);
      name = `${name} (PR-${p._id})`;
    }
    const testCases = tcTotalMap.get(p.id) ?? 0;
    const automated = tcAutoMap.get(p.id) ?? 0;
    return {
      name,
      users: usersMap.get(p.id) ?? 0,
      testCases,
      manual: testCases - automated,
      automated,
      executions: execTotalMap.get(p.id) ?? 0,
      passed: execPassedMap.get(p.id) ?? 0,
      openDefects: openByProject.get(p.id) ?? 0,
      criticalDefects: criticalByProject.get(p.id) ?? 0,
    };
  });

  const summary: DashboardCustomerSummary = {
    id: String(customer.id),
    name: String(customer.cust_name ?? '').trim() || `Customer ${customer.id}`,
    industry: '',
    projects,
    defectStatus: statusTotals,
    severity: severityTotals,
    trendTotal,
    trendPassed,
  };

  statsCache.set(customerId, { at: Date.now(), data: summary });
  return summary;
}
