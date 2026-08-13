import React from 'react';
import { Trophy, Award } from 'lucide-react';
import { Card, SectionHeader, Badge } from '../ui';
import { PersonalBestRecord } from '../../domain/analytics/personalBests';

interface PersonalBestsProps {
  personalBests: PersonalBestRecord[];
  showAll: boolean;
  onToggleShowAll: () => void;
}

export const PersonalBests: React.FC<PersonalBestsProps> = ({
  personalBests,
  showAll,
  onToggleShowAll
}) => {
  const displayed = showAll ? personalBests : personalBests.slice(0, 5);

  return (
    <Card variant="default" className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Personal Records Leaderboard"
          subtitle="Peak weight & estimated 1RM achievements"
        />

        {personalBests.length > 5 && (
          <button
            onClick={onToggleShowAll}
            className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors"
          >
            {showAll ? 'Show Top 5' : `View All (${personalBests.length})`}
          </button>
        )}
      </div>

      {displayed.length > 0 ? (
        <div className="space-y-2">
          {displayed.map((pb, idx) => (
            <div
              key={pb.exerciseId || idx}
              className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs">
                  {idx === 0 ? <Trophy className="w-4 h-4 text-amber-400" /> : `#${idx + 1}`}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{pb.name}</div>
                  <div className="text-xs text-zinc-500">{pb.target} • {pb.date}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-bold text-orange-400">{pb.maxE1RM} kg est. 1RM</div>
                <div className="text-xs text-zinc-400">{pb.maxWeight} kg top weight</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          No personal records established yet
        </div>
      )}
    </Card>
  );
};
