import React from 'react';
import { Sparkles, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, SectionHeader } from '../ui';
import { PerformanceInsight } from '../../domain/analytics/performanceInsights';

interface PerformanceInsightsProps {
  insights: PerformanceInsight[];
}

export const PerformanceInsights: React.FC<PerformanceInsightsProps> = ({ insights }) => {
  return (
    <Card variant="default" className="p-5 space-y-4">
      <SectionHeader
        title="Automated Training Insights"
        subtitle="Data-driven observations based on recent history"
      />

      <div className="space-y-2.5">
        {insights.map(item => (
          <div
            key={item.id}
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              item.type === 'positive'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                : item.type === 'warning'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                : 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
            }`}
          >
            {item.type === 'positive' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : item.type === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <Sparkles className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
