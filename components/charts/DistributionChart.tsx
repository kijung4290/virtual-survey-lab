'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_COLOR, GRID_COLOR, SERIES_COLORS, TEXT_SECONDARY } from '@/components/charts/palette';

export interface DistributionDatum {
  label: string;
  percent: number;
  count: number;
  /** 강조할 항목(예: 1순위) */
  highlight?: boolean;
}

/**
 * 단일 계열 가로 막대 그래프 (응답 비율).
 * - 계열이 1개이므로 범례 없이 제목이 계열을 설명한다.
 * - 값은 막대 끝에 직접 표시하고, 아래 표로 같은 수치를 반복 제공한다.
 */
export function DistributionChart({
  data,
  unitLabel = '%',
  height,
}: {
  data: DistributionDatum[];
  unitLabel?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-600">표시할 응답이 없습니다.</p>;
  }

  const chartHeight = height ?? Math.max(160, data.length * 38 + 40);
  const maxPercent = Math.max(...data.map((d) => d.percent), 10);

  return (
    <div aria-hidden="true">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }} barSize={16}>
          <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxPercent / 10) * 10]}
            tickFormatter={(v: number) => `${v}${unitLabel}`}
            tick={{ fill: TEXT_SECONDARY, fontSize: 12 }}
            axisLine={{ stroke: AXIS_COLOR }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fill: TEXT_SECONDARY, fontSize: 13 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, _name, item) => [
              `${value}${unitLabel} (${(item?.payload as DistributionDatum)?.count ?? 0}명)`,
              '응답',
            ]}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
          <Bar dataKey="percent" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={d.highlight === false ? '#cbd5e1' : SERIES_COLORS[0]} opacity={i === 0 ? 1 : 0.88} />
            ))}
            <LabelList
              dataKey="percent"
              position="right"
              formatter={(v: number) => `${v}${unitLabel}`}
              style={{ fill: TEXT_SECONDARY, fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
