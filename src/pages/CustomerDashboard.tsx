import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { cn } from '@/lib/utils';
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Cpu,
  Eye,
  FolderOpen,
  Layers,
  ListChecks,
  PlayCircle,
  ShieldCheck,
  TestTube2,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import type { DateRange } from 'react-day-picker';

interface MockProject {
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

interface DefectSeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface MockCustomer {
  id: string;
  name: string;
  industry: string;
  projects: MockProject[];
  defectStatus: { open: number; fixed: number; closed: number };
  severity: DefectSeverity;
  trendTotal: number[];
  trendPassed: number[];
}

type CustomerOption = Pick<MockCustomer, 'id' | 'name'>;

const EMPTY_CUSTOMER: MockCustomer = {
  id: '',
  name: '',
  industry: '',
  projects: [],
  defectStatus: { open: 0, fixed: 0, closed: 0 },
  severity: { critical: 0, high: 0, medium: 0, low: 0 },
  trendTotal: [0, 0, 0, 0],
  trendPassed: [0, 0, 0, 0],
};

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api/dashboard/${path}`;

const DATE_RANGE_OPTIONS = [
  'Today',
  'Last 7 Days',
  'Last 30 Days',
  'Last 90 Days',
  'Custom Range',
];

const fmt = (value: number) => value.toLocaleString('en-US');

const round1 = (value: number) => Math.round(value * 10) / 10;

const roundN = (value: number) => Math.max(0, Math.round(value));

const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

const getPassBadgeClass = (pctVal: number) =>
  pctVal >= 85
    ? 'bg-green-100 text-green-800 border-green-200'
    : pctVal >= 70
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-red-100 text-red-800 border-red-200';

const getAutomationBadgeClass = (pctVal: number) =>
  pctVal >= 70
    ? 'bg-green-100 text-green-800 border-green-200'
    : pctVal >= 50
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-red-100 text-red-800 border-red-200';

const automationColor = (pctVal: number) => {
  if (pctVal >= 70) return '#10b981';
  if (pctVal >= 50) return '#f59e0b';
  return '#ef4444';
};

interface DashboardSummary {
  totalProjects: number;
  totalUsers: number;
  totalTestCases: number;
  totalExecutions: number;
  passPct: number;
  openDefects: number;
  criticalDefects: number;
  manual: number;
  automated: number;
  automationPct: number;
  passed: number;
  failed: number;
  defect: { open: number; fixed: number; closed: number };
  severity: DefectSeverity;
  trend: { name: string; total: number; passed: number; failed: number }[];
}

function buildSummary(customer: MockCustomer, selectedProject: MockProject | null): DashboardSummary {
  const projects = selectedProject ? [selectedProject] : customer.projects;
  const sum = (key: 'users' | 'testCases' | 'executions' | 'passed' | 'manual' | 'automated') =>
    projects.reduce((acc, p) => acc + p[key], 0);

  const totalProjects = projects.length;
  const totalUsers = sum('users');
  const totalTestCases = sum('testCases');
  const totalExecutions = sum('executions');
  const passed = sum('passed');
  const passPct = percent(passed, totalExecutions);

  const manual = sum('manual');
  const automated = sum('automated');
  const automationPct = round1(percent(automated, totalTestCases));

  const openDefects = selectedProject ? selectedProject.openDefects : customer.defectStatus.open;
  const scale = selectedProject ? openDefects / customer.defectStatus.open : 1;
  const fixed = roundN(customer.defectStatus.fixed * scale);
  const closed = roundN(customer.defectStatus.closed * scale);

  const severity: DefectSeverity = {
    critical: roundN(customer.severity.critical * scale),
    high: roundN(customer.severity.high * scale),
    medium: roundN(customer.severity.medium * scale),
    low: roundN(customer.severity.low * scale),
  };

  const customerExecTotal = customer.projects.reduce((acc, p) => acc + p.executions, 0);
  const execScale = selectedProject ? selectedProject.executions / customerExecTotal : 1;
  const useTrendPassed = !selectedProject && Math.abs(execScale - 1) < 0.0001;

  const trend = customer.trendTotal.map((total, index) => {
    const scaledTotal = roundN(total * execScale);
    if (useTrendPassed) {
      const passedVal = customer.trendPassed[index];
      return {
        name: `Week ${index + 1}`,
        total: total,
        passed: passedVal,
        failed: total - passedVal,
      };
    }
    const passedVal = roundN(scaledTotal * (passPct / 100));
    return {
      name: `Week ${index + 1}`,
      total: scaledTotal,
      passed: passedVal,
      failed: scaledTotal - passedVal,
    };
  });

  const criticalDefects = selectedProject
    ? selectedProject.criticalDefects
    : customer.severity.critical;

  return {
    totalProjects,
    totalUsers,
    totalTestCases,
    totalExecutions,
    passPct: round1(passPct),
    openDefects,
    criticalDefects,
    manual,
    automated,
    automationPct,
    passed,
    failed: totalExecutions - passed,
    defect: { open: openDefects, fixed, closed },
    severity,
    trend,
  };
}

interface KpiCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}

function KpiCard({ title, value, sub, icon: Icon }: KpiCardProps) {
  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="p-5 lg:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl lg:text-4xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
          </div>
          <div className="w-11 h-11 lg:w-12 lg:h-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function SectionCard({ title, subtitle, action, children, className }: SectionCardProps) {
  return (
    <Card className={cn('border border-border shadow-sm h-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base lg:text-lg text-foreground">{title}</CardTitle>
            {subtitle && <CardDescription className="text-sm">{subtitle}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  config: ChartConfig;
  centerValue: string;
  centerLabel: string;
  className?: string;
}

function DonutChart({ data, config, centerValue, centerLabel, className }: DonutChartProps) {
  return (
    <div className={cn('relative', className)}>
      <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-[240px]">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={92}
            paddingAngle={4}
            strokeWidth={2}
            stroke="hsl(var(--background))"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} />
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl lg:text-3xl font-bold text-foreground tabular-nums">{centerValue}</span>
        <span className="text-xs text-muted-foreground mt-1 px-4 text-center">{centerLabel}</span>
      </div>
    </div>
  );
}

interface LegendRowItem {
  label: string;
  value: string;
  pct: string;
  color: string;
}

function LegendList({ items, columns = 1 }: { items: LegendRowItem[]; columns?: 1 | 2 }) {
  return (
    <div className={cn('grid gap-2.5', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
            <span className="text-sm text-muted-foreground truncate">{item.label}</span>
          </div>
          <span className="text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">
            {item.value}
            <span className="text-muted-foreground font-normal ml-1">({item.pct})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function SeverityBar({ label, value, max, color, barClass }: { label: string; value: number; max: number; color: string; barClass: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="font-semibold text-foreground tabular-nums">{fmt(value)}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barClass)}
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

const testManagementConfig = {
  Automated: { label: 'Automated', color: 'hsl(var(--primary))' },
  Manual: { label: 'Manual', color: '#94a3b8' },
} satisfies ChartConfig;

const executionConfig = {
  Passed: { label: 'Passed', color: '#10b981' },
  Failed: { label: 'Failed', color: '#ef4444' },
} satisfies ChartConfig;

const defectConfig = {
  Open: { label: 'Open', color: '#f59e0b' },
  Fixed: { label: 'Fixed', color: '#10b981' },
  Closed: { label: 'Closed', color: '#64748b' },
} satisfies ChartConfig;

const trendConfig = {
  total: { label: 'Total Executions', color: '#6366f1' },
  passed: { label: 'Passed', color: '#10b981' },
  failed: { label: 'Failed', color: '#ef4444' },
} satisfies ChartConfig;

const automationBarConfig = {
  automation: { label: 'Automation %', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

const kFormat = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(value));

const CustomerDashboard = () => {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('All Projects');
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [customerData, setCustomerData] = useState<MockCustomer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    (async () => {
      try {
        const res = await fetch(apiUrl('customers'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: CustomerOption[] = await res.json();
        if (cancelled) return;
        setCustomerList(list);
        setCustomerId((prev) => prev ?? list[0]?.id ?? null);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          toast({
            title: 'Failed to load customers',
            description: 'Could not reach the read-only dashboard data service.',
            variant: 'destructive',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, reloadKey]);

  useEffect(() => {
    if (!customerId) return undefined;
    let cancelled = false;
    setCustomerData(null);
    (async () => {
      try {
        const res = await fetch(apiUrl(`customers/${customerId}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: MockCustomer = await res.json();
        if (cancelled) return;
        setCustomerData(data);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          toast({
            title: 'Failed to load dashboard data',
            description: 'Could not reach the read-only dashboard data service.',
            variant: 'destructive',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, toast, reloadKey]);

  const customer = customerData ?? EMPTY_CUSTOMER;
  const selectedProject = projectName === 'All Projects' ? null : (customer.projects.find((p) => p.name === projectName) ?? null);

  const summary = useMemo(() => buildSummary(customer, selectedProject), [customer, selectedProject]);

  const availableProjects = customer.projects.map((p) => p.name);

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    setProjectName('All Projects');
  };

  const handleProjectDetails = (projectNameValue: string) => {
    toast({
      title: `Project details - ${projectNameValue}`,
      description: 'Drill-down navigation will be available in the V1 release.',
    });
  };

  const testManagementData: DonutDatum[] = [
    { name: 'Automated', value: summary.automated, color: 'hsl(var(--primary))' },
    { name: 'Manual', value: summary.manual, color: '#94a3b8' },
  ];

  const executionDonutData: DonutDatum[] = [
    { name: 'Passed', value: summary.passed, color: '#10b981' },
    { name: 'Failed', value: summary.failed, color: '#ef4444' },
  ];

  const defectDonutData: DonutDatum[] = [
    { name: 'Open', value: summary.defect.open, color: '#f59e0b' },
    { name: 'Fixed', value: summary.defect.fixed, color: '#10b981' },
    { name: 'Closed', value: summary.defect.closed, color: '#64748b' },
  ];

  const severityList: { label: string; value: number; color: string; barClass: string }[] = [
    { label: 'Critical', value: summary.severity.critical, color: '#ef4444', barClass: 'bg-red-500' },
    { label: 'High', value: summary.severity.high, color: '#f97316', barClass: 'bg-orange-500' },
    { label: 'Medium', value: summary.severity.medium, color: '#f59e0b', barClass: 'bg-amber-500' },
    { label: 'Low', value: summary.severity.low, color: '#10b981', barClass: 'bg-emerald-500' },
  ];
  const maxSeverity = Math.max(...severityList.map((s) => s.value), 1);

  const automationByProject = customer.projects.map((p) => ({
    name: p.name,
    automation: Math.round(percent(p.automated, p.testCases)),
  }));

  const defectTotal = summary.defect.open + summary.defect.fixed + summary.defect.closed;

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 gap-4 px-4 text-center">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">Failed to load dashboard data</p>
          <p className="text-xs text-muted-foreground mt-1">The read-only QA data service is unavailable.</p>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (!customerData) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <LoadingSpinner text="Loading dashboard data..." />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page header */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Customer-level quality, testing and automation overview across all projects
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground flex-wrap">
                <span className="font-medium text-foreground">Super Admin</span>
                <span>/</span>
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium text-foreground">{customer.name}</span>
                <span>/</span>
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium text-foreground">{projectName}</span>
              </div>
            </div>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1.5">
              Presentation Prototype · QA Data (read-only)
            </Badge>
          </div>

          {/* Filters */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-4 lg:p-5">
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Customer</label>
                    <Select value={customerId ?? undefined} onValueChange={handleCustomerChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customerList.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Project</label>
                    <Select value={projectName} onValueChange={setProjectName}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All Projects">All Projects</SelectItem>
                        {availableProjects.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Date Range</label>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select date range" />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_RANGE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {dateRange === 'Custom Range' && (
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full lg:w-auto gap-2 border-border">
                        <CalendarDays className="w-4 h-4" />
                        <span className="text-muted-foreground">
                          {selectedRange?.from ? `${selectedRange.from.toLocaleDateString()} - ${selectedRange.to?.toLocaleDateString() ?? ''}` : 'Pick start & end date'}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={selectedRange}
                        onSelect={setSelectedRange}
                        numberOfMonths={2}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 1 - Customer Summary */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Customer Summary</h2>
            <span className="text-xs text-muted-foreground">· {customer.name} · {dateRange}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard title="Total Projects" value={fmt(summary.totalProjects)} sub="Across all product lines" icon={FolderOpen} />
            <KpiCard title="Total Users" value={fmt(summary.totalUsers)} sub="Active users across projects" icon={Users} />
            <KpiCard title="Total Test Cases" value={fmt(summary.totalTestCases)} sub={`${fmt(summary.totalTestCases)} automated + manual`} icon={ListChecks} />
            <KpiCard title="Total Executions" value={fmt(summary.totalExecutions)} sub={`${dateRange.toLowerCase()} for ${projectName}`} icon={PlayCircle} />
          </div>
        </section>

        {/* Section 2 - Quality Summary */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Quality Summary</h2>
            <span className="text-xs text-muted-foreground">· Overall quality health</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pass Percentage - prominent */}
            <div className="lg:col-span-1 rounded-lg border border-emerald-200 bg-emerald-50/60 shadow-sm">
              <div className="p-5 lg:p-6 h-full">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-900">Pass Percentage</p>
                </div>
                <div className="mt-4 flex items-center gap-5">
                  <div className="relative flex items-center justify-center">
                    <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
                      <circle cx="52" cy="52" r="46" fill="none" stroke="#d1fae5" strokeWidth="10" />
                      <circle
                        cx="52"
                        cy="52"
                        r="46"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${(summary.passPct / 100) * 2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                      />
                    </svg>
                    <div className="absolute text-center">
                      <p className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.passPct.toFixed(1)}%</p>
                      <p className="text-[10px] text-emerald-600">of executions</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2.5 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Healthy
                    </span>
                    <p className="text-xs text-emerald-700/80 leading-relaxed">
                      {fmt(summary.passed)} of {fmt(summary.totalExecutions)} executions passed
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Open Defects */}
            <Card className="border border-amber-200 shadow-sm">
              <CardContent className="p-5 lg:p-6 h-full">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-semibold text-muted-foreground">Open Defects</p>
                </div>
                <p className="text-4xl font-bold text-foreground mt-4 tabular-nums">{fmt(summary.openDefects)}</p>
                <div className="mt-3 space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Needs Monitoring
                  </span>
                  <p className="text-xs text-muted-foreground">Open issues requiring triage and resolution</p>
                </div>
              </CardContent>
            </Card>

            {/* Critical Defects */}
            <Card className="border border-red-200 shadow-sm">
              <CardContent className="p-5 lg:p-6 h-full">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-500" />
                  <p className="text-sm font-semibold text-muted-foreground">Critical Defects</p>
                </div>
                <p className="text-4xl font-bold text-destructive mt-4 tabular-nums">{fmt(summary.criticalDefects)}</p>
                <div className="mt-3 space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100 border border-red-200 rounded-full px-2.5 py-1">
                    <AlertOctagon className="w-3.5 h-3.5" />
                    Requires Attention
                  </span>
                  <p className="text-xs text-muted-foreground">Critical defects blocking releases or runs</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Sections 3 & 4 - Test Management + Execution Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard
            title="Test Management"
            subtitle="Testing coverage mix for the selected customer"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 border border-primary/20 rounded-full px-2.5 py-1">
                <TestTube2 className="w-3.5 h-3.5" />
                {summary.automationPct.toFixed(1)}% Automated
              </span>
            }
          >
            <div className="grid sm:grid-cols-2 gap-6 items-center">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Total Test Cases</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{fmt(summary.totalTestCases)}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Manual</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{fmt(summary.manual)}</p>
                </div>
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-4">
                  <p className="text-xs text-muted-foreground">Automated</p>
                  <p className="text-xl font-bold text-primary mt-1 tabular-nums">{fmt(summary.automated)}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Automation %</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{summary.automationPct.toFixed(1)}%</p>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[260px]">
                <DonutChart
                  data={testManagementData}
                  config={testManagementConfig}
                  centerValue={`${summary.automationPct.toFixed(1)}%`}
                  centerLabel="Automation Coverage"
                />
                <div className="mt-2">
                  <LegendList
                    columns={1}
                    items={[
                      { label: 'Automated', value: fmt(summary.automated), pct: `${round1(percent(summary.automated, summary.totalTestCases))}%`, color: 'hsl(var(--primary))' },
                      { label: 'Manual', value: fmt(summary.manual), pct: `${round1(percent(summary.manual, summary.totalTestCases))}%`, color: '#94a3b8' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Execution Overview"
            subtitle="Passed vs failed executions for the selected scope"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {summary.passPct.toFixed(1)}% Pass Rate
              </span>
            }
          >
            <div className="grid sm:grid-cols-2 gap-6 items-center">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Total Executions</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{fmt(summary.totalExecutions)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                  <p className="text-xs text-muted-foreground">Passed</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">{fmt(summary.passed)}</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 p-4">
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="text-xl font-bold text-red-700 mt-1 tabular-nums">{fmt(summary.failed)}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Pass %</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{summary.passPct.toFixed(1)}%</p>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[260px]">
                <DonutChart
                  data={executionDonutData}
                  config={executionConfig}
                  centerValue={fmt(summary.passed)}
                  centerLabel="Passed Executions"
                />
                <div className="mt-2">
                  <LegendList
                    columns={1}
                    items={[
                      { label: 'Passed', value: fmt(summary.passed), pct: `${round1(percent(summary.passed, summary.totalExecutions))}%`, color: '#10b981' },
                      { label: 'Failed', value: fmt(summary.failed), pct: `${round1(percent(summary.failed, summary.totalExecutions))}%`, color: '#ef4444' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Section 5 - Defect Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard
            title="Defect Overview"
            subtitle="Overall defect health"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                {fmt(defectTotal)} Total Defects
              </span>
            }
          >
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0 w-full max-w-[240px]">
                <DonutChart
                  data={defectDonutData}
                  config={defectConfig}
                  centerValue={fmt(defectTotal)}
                  centerLabel="Total Defects"
                />
              </div>
              <div className="flex-1 w-full max-w-[300px]">
                <LegendList
                  items={[
                    { label: 'Open', value: fmt(summary.defect.open), pct: `${round1(percent(summary.defect.open, defectTotal))}%`, color: '#f59e0b' },
                    { label: 'Fixed', value: fmt(summary.defect.fixed), pct: `${round1(percent(summary.defect.fixed, defectTotal))}%`, color: '#10b981' },
                    { label: 'Closed', value: fmt(summary.defect.closed), pct: `${round1(percent(summary.defect.closed, defectTotal))}%`, color: '#64748b' },
                  ]}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Defects by Severity"
            subtitle="Distribution across severity levels"
            action={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
                <AlertOctagon className="w-3.5 h-3.5" />
                {fmt(summary.severity.critical)} Critical
              </span>
            }
          >
            <div className="space-y-5">
              {severityList.map((s) => (
                <SeverityBar key={s.label} label={s.label} value={s.value} max={maxSeverity} color={s.color} barClass={s.barClass} />
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Section 6 - Project Overview */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Project Overview</h2>
            <span className="text-xs text-muted-foreground">· Comparison of all projects for {customer.name}</span>
          </div>
          <Card className="border border-border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="min-w-[200px] px-5">Project Name</TableHead>
                      <TableHead className="text-right px-4">Users</TableHead>
                      <TableHead className="text-right px-4">Test Cases</TableHead>
                      <TableHead className="text-right px-4">Executions</TableHead>
                      <TableHead className="text-right px-4">Pass %</TableHead>
                      <TableHead className="text-right px-4">Open Defects</TableHead>
                      <TableHead className="text-right px-4">Automation %</TableHead>
                      <TableHead className="text-right px-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.projects.map((project) => {
                      const projectPass = round1(percent(project.passed, project.executions));
                      const projectAuto = round1(percent(project.automated, project.testCases));
                      const isActive = selectedProject?.name === project.name;
                      return (
                        <TableRow key={project.name} className={cn('hover:bg-gray-50', isActive && 'bg-primary/[0.04]')}>
                          <TableCell className="px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FolderOpen className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{project.name}</p>
                                <p className="text-xs text-muted-foreground">Project #{project.name.length % 100}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right px-4 tabular-nums">{fmt(project.users)}</TableCell>
                          <TableCell className="text-right px-4 tabular-nums">{fmt(project.testCases)}</TableCell>
                          <TableCell className="text-right px-4 tabular-nums">{fmt(project.executions)}</TableCell>
                          <TableCell className="text-right px-4">
                            <Badge variant="outline" className={cn('px-2 py-1 font-medium', getPassBadgeClass(projectPass))}>
                              {projectPass.toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right px-4">
                            <span className={cn('text-sm font-semibold tabular-nums', project.openDefects >= 25 ? 'text-amber-600' : 'text-foreground')}>
                              {fmt(project.openDefects)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right px-4">
                            <Badge variant="outline" className={cn('px-2 py-1 font-medium', getAutomationBadgeClass(projectAuto))}>
                              {projectAuto.toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="px-5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              aria-label={`View details for ${project.name}`}
                              onClick={() => handleProjectDetails(project.name)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 7 - Execution Trend */}
        <SectionCard
          title="Execution Trend"
          subtitle="Weekly execution volumes - total, passed and failed"
          action={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 border border-primary/20 rounded-full px-2.5 py-1">
              <BarChart3 className="w-3.5 h-3.5" />
              Last 4 Weeks
            </span>
          }
        >
          <ChartContainer config={trendConfig} className="h-[300px] w-full">
            <ComposedChart data={summary.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} dy={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={kFormat}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="passed"
                stackId="executions"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.25}
              />
              <Area
                type="monotone"
                dataKey="failed"
                stackId="executions"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.25}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ChartContainer>
          <div className="flex items-center justify-center gap-6 mt-2">
            {[
              { label: 'Total', color: '#6366f1' },
              { label: 'Passed', color: '#10b981' },
              { label: 'Failed', color: '#ef4444' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Section 8 - Automation Overview */}
        <SectionCard
          title="Automation Overview"
          subtitle="Automation coverage percentage by project"
          action={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-1">
              <Cpu className="w-3.5 h-3.5" />
              {summary.automationPct.toFixed(1)}% Overall
            </span>
          }
        >
          <ChartContainer config={automationBarConfig} className="h-[260px] w-full">
            <ComposedChart data={automationByProject} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
              <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={170} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="automation" radius={[0, 4, 4, 0]} barSize={22}>
                {automationByProject.map((entry) => (
                  <Cell key={entry.name} fill={automationColor(entry.automation)} />
                ))}
                <LabelList dataKey="automation" position="right" formatter={(v: number) => `${v}%`} className="fill-foreground font-semibold" />
              </Bar>
            </ComposedChart>
          </ChartContainer>
          <div className="flex items-center justify-center gap-6 mt-2">
            {[
              { label: 'High (≥70%)', color: '#10b981' },
              { label: 'Medium (50-69%)', color: '#f59e0b' },
              { label: 'Low (<50%)', color: '#ef4444' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <footer className="flex items-center justify-between pb-2">
          <p className="text-xs text-muted-foreground">
            UI prototype · Customer-level dashboard for Super Admin · Read-only QA data
          </p>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Read-only source</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default CustomerDashboard;