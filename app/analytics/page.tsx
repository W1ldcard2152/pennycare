'use client';

import { useState, useEffect } from 'react';
import {
  CurrencyDollarIcon,
  ClockIcon,
  UserGroupIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface AnalyticsData {
  year: number;
  kpis: {
    totalPayrollYTD: number;
    totalNetPayYTD: number;
    avgPayrollPerPeriod: number;
    totalEmployerCostYTD: number;
    avgEmployeeCost: number;
    totalHours: number;
    totalOvertimeHours: number;
    overtimePercentage: number;
    totalPayPeriods: number;
    activeEmployees: number;
  };
  payrollTrend: Array<{ month: string; grossPay: number; netPay: number; employerCost: number; totalDeductions: number }>;
  taxBreakdown: { federal: number; state: number; local: number; fica: number; sdi: number; pfl: number };
  compensationMix: { regularPay: number; overtimePay: number; otherEarnings: number };
  deductionDistribution: { retirement: number; healthInsurance: number; hsaFsa: number; garnishments: number; loanRepayments: number; other: number };
  overtimeTrend: Array<{ month: string; hours: number; cost: number }>;
}

const COLORS = {
  blue: '#3B82F6',
  green: '#10B981',
  purple: '#8B5CF6',
  red: '#EF4444',
  orange: '#F59E0B',
  teal: '#14B8A6',
  indigo: '#6366F1',
  pink: '#EC4899',
};

const PIE_COLORS = [COLORS.red, COLORS.orange, COLORS.indigo, COLORS.teal, COLORS.pink, COLORS.purple];

export default function AnalyticsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

  const formatCurrencyFull = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  useEffect(() => {
    fetchData();
  }, [year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?year=${year}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const hasData = data && data.kpis.totalPayrollYTD > 0;

  // Build pie data arrays
  const taxPieData = data ? [
    { name: 'Federal', value: data.taxBreakdown.federal },
    { name: 'State', value: data.taxBreakdown.state },
    { name: 'Local', value: data.taxBreakdown.local },
    { name: 'FICA', value: data.taxBreakdown.fica },
    { name: 'SDI', value: data.taxBreakdown.sdi },
    { name: 'PFL', value: data.taxBreakdown.pfl },
  ].filter(d => d.value > 0) : [];

  const compPieData = data ? [
    { name: 'Regular Pay', value: data.compensationMix.regularPay },
    { name: 'Overtime', value: data.compensationMix.overtimePay },
    { name: 'Other', value: data.compensationMix.otherEarnings },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-2 text-gray-600">Payroll insights and trends</p>
        </div>
        <div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {/* Skeleton KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
          {/* Skeleton charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center rounded-lg bg-white py-24 shadow">
          <ChartBarIcon className="h-16 w-16 text-gray-300" />
          <h2 className="mt-4 text-xl font-semibold text-gray-500">No Payroll Data for {year}</h2>
          <p className="mt-2 text-gray-400">Process payroll to see analytics here.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <KPICard icon={CurrencyDollarIcon} label="Total Payroll YTD" value={formatCurrency(data!.kpis.totalPayrollYTD)} color="blue" />
            <KPICard icon={CurrencyDollarIcon} label="Avg Per Period" value={formatCurrency(data!.kpis.avgPayrollPerPeriod)} color="blue" subtext={`${data!.kpis.totalPayPeriods} pay periods`} />
            <KPICard icon={CurrencyDollarIcon} label="Employer Cost YTD" value={formatCurrency(data!.kpis.totalEmployerCostYTD)} color="purple" />
            <KPICard icon={UserGroupIcon} label="Avg Employee Cost" value={formatCurrency(data!.kpis.avgEmployeeCost)} color="purple" subtext={`${data!.kpis.activeEmployees} active employees`} />
            <KPICard icon={ClockIcon} label="Total Hours" value={data!.kpis.totalHours.toLocaleString()} color="gray" />
            <KPICard icon={ClockIcon} label="Overtime %" value={`${data!.kpis.overtimePercentage.toFixed(1)}%`} color="orange" subtext={`${data!.kpis.totalOvertimeHours.toFixed(1)} OT hours`} />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Payroll Cost Trend */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Payroll Cost Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data!.payrollTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                  <Legend />
                  <Bar dataKey="grossPay" name="Gross Pay" fill={COLORS.blue} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="netPay" name="Net Pay" fill={COLORS.green} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="employerCost" name="Employer Cost" fill={COLORS.purple} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tax Breakdown */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Tax Breakdown</h3>
              {taxPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={taxPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {taxPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-gray-400">No tax data</div>
              )}
            </div>

            {/* Compensation Mix */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Compensation Mix</h3>
              {compPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={compPieData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      <Cell fill={COLORS.blue} />
                      <Cell fill={COLORS.orange} />
                      <Cell fill={COLORS.teal} />
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-gray-400">No compensation data</div>
              )}
            </div>

            {/* Overtime Trend */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Overtime Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data!.overtimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number, name: string) => name === 'hours' ? `${value} hrs` : formatCurrencyFull(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="hours" name="OT Hours" stroke={COLORS.orange} fill={COLORS.orange} fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color, subtext }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
  subtext?: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; value: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', value: 'text-blue-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', value: 'text-purple-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', value: 'text-green-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', value: 'text-orange-700' },
    gray: { bg: 'bg-gray-50', icon: 'text-gray-600', value: 'text-gray-700' },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${c.value}`}>{value}</p>
          {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}
