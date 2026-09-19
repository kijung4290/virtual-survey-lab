'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_COLOR, GRID_COLOR, TEXT_SECONDARY, seriesColor } from '@/components/charts/palette';

export interface SeriesSpec {
  name: string;
  /** categories 와 같은 순서의 값 */
  values: number[];
}

/**
 * 다계열 가로 막대 (Synthetic vs Actual, 반복 실행 비교 등).
 * - 계열이 2개 이상이므로 범례를 항상 표시한다.
 * - 같은 수치를 표로도 제공하므로 색만으로 구분하지 않는다.
 */
export function SeriesBarChart({
  categories,
  series,
  unitLabel = '%',
}: {
  categories: string[];
  series: SeriesSpec[];
  unitLabel?: string;
}) {
  if (categories.length === 0 || series.length === 0) {
    return <p className="text-sm text-slate-600">표시할 데이터가 없습니다.</p>;
  }

  const data = categories.map((label, i) => {
    const row: Record<string, string | number> = { label };
    series.forEach((s) => {
      row[s.name] = s.values[i] ?? 0;
    });
    return row;
  });

  const height = Math.max(200, categories.length * (22 * series.length + 22) + 50);

  return (
    <div aria-hidden="true">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barSize={14}>
          <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
          <XAxis
            type="number"
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
            formatter={(value: number, name: string) => [`${value}${unitLabel}`, name]}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 13, color: TEXT_SECONDARY }} />
          {series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={seriesColor(i)}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
