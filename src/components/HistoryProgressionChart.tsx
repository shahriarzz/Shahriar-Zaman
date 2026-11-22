import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartTooltip, CHART_THEME, CHART_GRID_PROPS, CHART_AXIS_PROPS } from './ui';
import { ExerciseSessionHistoryEntry } from '../utils/fitnessDerivedSelectors';

interface HistoryProgressionChartProps {
  exerciseName: string;
  historyLogs: ExerciseSessionHistoryEntry[];
}

export const HistoryProgressionChart: React.FC<HistoryProgressionChartProps> = ({
  exerciseName,
  historyLogs,
}) => {
  const chartData = useMemo(() => historyLogs.slice().reverse(), [historyLogs]);

  return (
    <div
      className="h-32 w-full pt-1"
      role="img"
      aria-label={`Weight progression line chart for ${exerciseName} across ${historyLogs.length} sessions`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -4, bottom: 4 }}>
          <CartesianGrid {...CHART_GRID_PROPS} vertical={false} />
          <XAxis
            dataKey="date"
            {...CHART_AXIS_PROPS}
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={(val) => val.split('-').slice(1).join('/')}
          />
          <YAxis
            {...CHART_AXIS_PROPS}
            width={42}
            tickFormatter={(val) => `${val}kg`}
          />
          <Tooltip
            isAnimationActive={false}
            animationDuration={0}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const point = payload[0].payload as { date: string; maxW: number };
                return (
                  <ChartTooltip>
                    <p className="text-zinc-400 font-bold">Date: {point.date}</p>
                    <p className="text-indigo-400 font-bold tabular-nums">
                      Peak Weight: {point.maxW}kg
                    </p>
                  </ChartTooltip>
                );
              }
              return null;
            }}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="maxW"
            stroke={CHART_THEME.indigo}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART_THEME.indigo, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: CHART_THEME.indigo, stroke: CHART_THEME.text, strokeWidth: 1.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
