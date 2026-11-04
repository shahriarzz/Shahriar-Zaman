export interface HistoryTabState {
  search: string;
  expandedDate: string | null;
  selectedExKey: string | null;
  activeMonthTab: string | null;
}

export interface AnalyticsTabState {
  timeRange: '7d' | '30d' | '90d' | 'all';
  muscleMetric: 'volume' | 'sets' | 'frequency';
  selected1RMExerciseId: string | null;
  currentHeatmapMonth: Date;
}

export interface SavedTabState {
  history: HistoryTabState;
  analytics: AnalyticsTabState;
}

export const DEFAULT_HISTORY_TAB_STATE: HistoryTabState = {
  search: '',
  expandedDate: null,
  selectedExKey: null,
  activeMonthTab: null
};

export const DEFAULT_ANALYTICS_TAB_STATE: AnalyticsTabState = {
  timeRange: '30d',
  muscleMetric: 'volume',
  selected1RMExerciseId: null,
  currentHeatmapMonth: new Date()
};
