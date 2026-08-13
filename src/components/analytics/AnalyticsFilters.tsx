import React from 'react';
import { SegmentedControl } from '../ui';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

interface AnalyticsFiltersProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export const AnalyticsFilters: React.FC<AnalyticsFiltersProps> = ({
  timeRange,
  onTimeRangeChange
}) => {
  return (
    <div className="flex items-center justify-between bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-800/80">
      <span className="text-xs font-semibold text-zinc-400 pl-2">Timeframe</span>
      <SegmentedControl
        options={[
          { value: '7d', label: '7 Days' },
          { value: '30d', label: '30 Days' },
          { value: '90d', label: '90 Days' },
          { value: 'all', label: 'All Time' }
        ]}
        value={timeRange}
        onChange={(val) => onTimeRangeChange(val as TimeRange)}
        size="sm"
      />
    </div>
  );
};
