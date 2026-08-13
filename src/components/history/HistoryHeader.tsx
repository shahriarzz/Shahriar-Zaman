import React from 'react';
import { History as HistoryIcon } from 'lucide-react';

interface HistoryHeaderProps {
  totalSessions: number;
}

export const HistoryHeader: React.FC<HistoryHeaderProps> = ({ totalSessions }) => {
  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
        <HistoryIcon className="w-6 h-6 text-orange-500" />
        Session History
      </h1>
      <p className="text-xs text-zinc-400 mt-1">
        {totalSessions} recorded training sessions in permanent history
      </p>
    </div>
  );
};
