import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, SectionHeader } from '../ui';

export const AnalyticsEmptyState: React.FC = () => {
  return (
    <div className="py-12 px-4 text-center">
      <Card variant="glass" className="max-w-md mx-auto p-8 border-zinc-800 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mx-auto">
          <Sparkles className="w-6 h-6" />
        </div>
        <SectionHeader title="No Workout Data Yet" subtitle="Complete your first workout session to unlock performance insights and strength progression tracking." />
      </Card>
    </div>
  );
};
