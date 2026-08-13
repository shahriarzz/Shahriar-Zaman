import React, { useState } from 'react';
import { Scale, Plus, Trash2 } from 'lucide-react';
import { Card, SectionHeader, Input, Button } from '../ui';

interface BodyWeightCardProps {
  bodyWeightLogs: Record<string, number>;
  onLogWeight: (dateStr: string, weight: number) => void;
  onDeleteWeight: (dateStr: string) => void;
}

export const BodyWeightCard: React.FC<BodyWeightCardProps> = ({
  bodyWeightLogs,
  onLogWeight,
  onDeleteWeight
}) => {
  const [val, setVal] = useState('');

  const handleAdd = () => {
    const num = parseFloat(val);
    if (num && num >= 20 && num <= 300) {
      const today = new Date().toISOString().split('T')[0];
      onLogWeight(today, num);
      setVal('');
    }
  };

  const entries = Object.entries(bodyWeightLogs || {})
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .slice(0, 3);

  return (
    <Card variant="default" className="p-5 space-y-4">
      <SectionHeader title="Body Weight Tracker" subtitle="Log daily measurements" />

      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Weight in kg..."
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="text-xs"
        />
        <Button variant="primary" size="sm" onClick={handleAdd} className="shrink-0 text-xs">
          <Plus className="w-4 h-4 mr-1" /> Log
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="space-y-2 pt-2">
          {entries.map(([date, weight]) => (
            <div key={date} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
              <span className="text-zinc-400">{date}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{weight} kg</span>
                <button onClick={() => onDeleteWeight(date)} className="text-zinc-500 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
