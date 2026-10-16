"use client";

import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const C = { brand: "#1f4fa3", gold: "#c8a24a", slate: "#94a3b8", green: "#059669", amber: "#d97706", rose: "#e11d48", violet: "#7c3aed", sky: "#0284c7" };
export const CATEGORY_COLORS: Record<string, string> = {
  meeting: C.brand, general: C.violet, service: C.green, mentoring: C.amber, study: C.slate, recruitment: C.rose, uncategorized: "#cbd5e1",
};

function Empty({ text = "Not enough data yet." }: { text?: string }) {
  return <div className="flex h-56 items-center justify-center text-sm text-slate-400">{text}</div>;
}

const axis = { fontSize: 11, fill: "#64748b" };

export function AttendanceByEventChart({ data }: { data: { id: string; name: string; date: string; members: number; prospects: number; other: number }[] }) {
  const router = useRouter();
  if (!data.length) return <Empty text="No attendance recorded this semester yet." />;
  return (
    <div className="h-72" role="img" aria-label="Attendance by event, members and prospects">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={axis} interval={0} angle={-30} textAnchor="end" height={48} />
          <YAxis tick={axis} allowDecimals={false} />
          <Tooltip labelFormatter={(_, p) => (p?.[0]?.payload as { name?: string })?.name ?? ""} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="members" name="Members" stackId="a" fill={C.brand} cursor="pointer" onClick={(d) => router.push(`/events/${(d as unknown as { id: string }).id}`)} />
          <Bar isAnimationActive={false} dataKey="prospects" name="Prospects" stackId="a" fill={C.gold} cursor="pointer" onClick={(d) => router.push(`/events/${(d as unknown as { id: string }).id}`)} />
          <Bar isAnimationActive={false} dataKey="other" name="Unclassified" stackId="a" fill={C.slate} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }: { data: { date: string; attended: number; cumulative: number }[] }) {
  if (data.length < 2) return <Empty text="A trend appears after two or more events have attendance." />;
  return (
    <div className="h-64" role="img" aria-label="Attendance trend across the semester">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: -10, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={axis} />
          <YAxis yAxisId="l" tick={axis} allowDecimals={false} />
          <YAxis yAxisId="r" orientation="right" tick={axis} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="l" isAnimationActive={false} type="monotone" dataKey="attended" name="Attended at event" stroke={C.brand} strokeWidth={2} dot={{ r: 3 }} />
          <Line isAnimationActive={false} yAxisId="r" type="monotone" dataKey="cumulative" name="Cumulative" stroke={C.gold} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ data }: { data: { key: string; name: string; attended: number; events: number }[] }) {
  const router = useRouter();
  if (!data.some((d) => d.attended > 0)) return <Empty />;
  return (
    <div className="h-64" role="img" aria-label="Attendance by event category">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={axis} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={axis} width={86} />
          <Tooltip formatter={(v, _n, p) => [`${v} attended across ${(p.payload as { events: number }).events} event(s)`, "Attendance"]} />
          <Bar isAnimationActive={false} dataKey="attended" cursor="pointer" onClick={(d) => router.push(`/events?category=${(d as unknown as { key: string }).key}`)}>
            {data.map((d) => <Cell key={d.key} fill={CATEGORY_COLORS[d.key] ?? C.slate} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionChart({ data, hrefFor, label, color = C.brand }: { data: { bucket: string; count: number; filter: string }[]; hrefFor: string; label: string; color?: string }) {
  const router = useRouter();
  if (!data.some((d) => d.count > 0)) return <Empty />;
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="bucket" tick={axis} />
          <YAxis tick={axis} allowDecimals={false} />
          <Tooltip />
          <Bar isAnimationActive={false} dataKey="count" name={label} fill={color} cursor="pointer" onClick={(d) => router.push(`${hrefFor}${(d as unknown as { filter: string }).filter}`)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EngagementPie({ data }: { data: { key: string; name: string; value: number }[] }) {
  const router = useRouter();
  const colors: Record<string, string> = { high: C.green, medium: C.gold, low: C.slate };
  if (!data.some((d) => d.value > 0)) return <Empty text="No prospective members yet." />;
  return (
    <div className="h-56" role="img" aria-label="Prospective member engagement">
      <ResponsiveContainer>
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2} cursor="pointer"
            onClick={(d) => router.push(`/prospects?interest=${(d as unknown as { key: string }).key}`)}>
            {data.map((d) => <Cell key={d.key} fill={colors[d.key]} />)}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SemesterComparisonChart({ data }: { data: { name: string; avgPerEvent: number; events: number }[] }) {
  if (data.length < 2) return <Empty text="Comparisons appear once a second semester has attendance." />;
  return (
    <div className="h-56" role="img" aria-label="Average attendance per event by semester">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={axis} />
          <YAxis tick={axis} />
          <Tooltip formatter={(v, _n, p) => [`${v} per event (${(p.payload as { events: number }).events} events)`, "Average"]} />
          <Bar isAnimationActive={false} dataKey="avgPerEvent" fill={C.brand} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
