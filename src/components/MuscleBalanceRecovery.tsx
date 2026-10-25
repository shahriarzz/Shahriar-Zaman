import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Activity, Layers, Info } from 'lucide-react';
import { useFitnessDerivedData } from '../hooks/useFitnessDerivedData';
import {
  selectMuscleBalanceForRange,
  selectMuscleRecovery,
  MuscleGroupBalance,
  MuscleRecoveryItem
} from '../utils/muscleIntelligence';
import { haptics } from '../utils/haptics';
import { cn } from '../lib/utils';
import {
  Card,
  Button,
  SURFACE,
  BORDER,
  RADIUS,
  TRANSITION
} from './ui';

interface MuscleBalanceRecoveryProps {
  startDate: string;
  endDate: string;
  timeRangeLabel?: string;
  referenceDate: Date | string;
}

export const MuscleBalanceRecovery: React.FC<MuscleBalanceRecoveryProps> = ({
  startDate,
  endDate,
  timeRangeLabel = 'Selected Period',
  referenceDate
}) => {
  const { index } = useFitnessDerivedData();
  const [showAllGroups, setShowAllGroups] = useState<boolean>(false);
  const [showCoverageDetail, setShowCoverageDetail] = useState<boolean>(false);

  // Compute Muscle Balance for the active time window
  const balanceResult = useMemo(() => {
    return selectMuscleBalanceForRange(index, startDate, endDate);
  }, [index, startDate, endDate]);

  // Compute 14-day Recovery Context from mandatory referenceDate
  const recoveryResult = useMemo(() => {
    return selectMuscleRecovery(index, referenceDate);
  }, [index, referenceDate]);

  const { allGroups, totalAttributedWSE, coverage } = balanceResult;
  const visibleGroups: MuscleGroupBalance[] = showAllGroups ? allGroups : allGroups.slice(0, 6);

  // Highest WSE in visible set for proportional bar scaling
  const maxWse = useMemo(() => {
    return Math.max(...allGroups.map(g => g.wse), 1);
  }, [allGroups]);

  // Use authoritative peak directly from recoveryResult
  const maxResidual = recoveryResult.maxResidualStimulus;
  const hasAnyResidual = maxResidual > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ------------------------------------------------------------- */}
      {/* CARD 1: MUSCLE BALANCE (STIMULUS DISTRIBUTION) */}
      {/* ------------------------------------------------------------- */}
      <Card
        surface="default"
        variant="standard"
        padding="standard"
        className="flex flex-col justify-between"
      >
        <div>
          {/* Card Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                  Muscle Balance
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Multi-muscle attribution · {timeRangeLabel} · % of attributed WSE
              </p>
            </div>

            {/* Total WSE Tabular Summary */}
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                {totalAttributedWSE.toFixed(1)}
              </span>
              <span className="text-[10px] text-zinc-500 uppercase ml-1">WSE</span>
            </div>
          </div>

          {/* Transparent Attribution Coverage Banner (Unboxed, clean metadata) */}
          <div className={cn("p-2.5 mb-4 border", SURFACE.recessed, BORDER.subtle, RADIUS.button)}>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-zinc-300">
                <span className="text-zinc-400">Attribution Coverage:</span>
                <span className="font-mono font-medium tabular-nums text-white">
                  {coverage.totalEligibleSets === 0
                    ? '—'
                    : `${coverage.curatedSets + coverage.inferredSets} / ${coverage.totalEligibleSets} sets`}
                </span>
                <span className="text-emerald-400 font-mono font-bold tabular-nums">
                  {coverage.coveragePercent !== null
                    ? `(${coverage.coveragePercent}%)`
                    : '(—)'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  haptics.selection();
                  setShowCoverageDetail(!showCoverageDetail);
                }}
                icon={<Info className="w-3.5 h-3.5" />}
                aria-label="Toggle coverage breakdown details"
                className="px-2 text-[11px] text-zinc-400 hover:text-white"
              >
                {showCoverageDetail ? 'Hide' : 'Details'}
              </Button>
            </div>

            {showCoverageDetail && (
              <div className={cn("mt-2 pt-2 border-t text-[11px] text-zinc-400 space-y-1.5", BORDER.standard)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span>Curated: <strong className="text-zinc-200 font-mono">{coverage.curatedSets}</strong></span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span>Inferred: <strong className="text-zinc-200 font-mono">{coverage.inferredSets}</strong></span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span>Unclassified: <strong className="text-zinc-400 font-mono">{coverage.unclassifiedSets}</strong></span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Attribution coverage measures how many eligible sets could be mapped to muscles; it does not measure the accuracy of the underlying biomechanical mapping.
                </p>
              </div>
            )}
          </div>

          {/* Muscle Groups Ranked List */}
          {coverage.totalEligibleSets === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No eligible completed sets recorded in this period.
            </div>
          ) : totalAttributedWSE === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Completed sets exist, but no muscle attribution could be assigned.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGroups.map((group, idx) => {
                const isZero = group.wse === 0;
                const fillPercent = maxWse > 0 ? (group.wse / maxWse) * 100 : 0;

                return (
                  <div key={group.muscle} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-4 font-mono text-[10px] tabular-nums text-right",
                          isZero ? "text-zinc-600" : "text-zinc-400"
                        )}>
                          {idx + 1}.
                        </span>
                        <span className={cn(
                          "font-medium",
                          isZero ? "text-zinc-500" : "text-zinc-200 group-hover:text-white transition-colors"
                        )}>
                          {group.label}
                        </span>
                        {isZero && (
                          <span className="text-[10px] text-zinc-600 tracking-wider font-mono">
                            (0 exposure)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <span className={cn(
                          "font-mono font-medium tabular-nums",
                          isZero ? "text-zinc-600" : "text-zinc-200"
                        )}>
                          {group.wse.toFixed(1)} <span className="text-[10px] text-zinc-500">WSE</span>
                        </span>
                        <span className={cn(
                          "w-12 text-right font-mono text-[11px] tabular-nums",
                          isZero ? "text-zinc-600" : "text-emerald-400 font-semibold"
                        )}>
                          {group.sharePercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="h-1.5 w-full bg-zinc-950/80 rounded-full overflow-hidden border border-zinc-800/40">
                      {!isZero && (
                        <div
                          className={cn("h-full bg-emerald-500/80 group-hover:bg-emerald-400 rounded-full", TRANSITION.progressBar)}
                          style={{ width: `${Math.max(fillPercent, 2)}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* View All (15) Toggle */}
        {allGroups.length > 6 && (
          <div className={cn("mt-4 pt-3 border-t flex justify-center", BORDER.subtle)}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                haptics.selection();
                setShowAllGroups(!showAllGroups);
              }}
              icon={showAllGroups ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              iconPosition="right"
              className="text-xs text-zinc-400 hover:text-white"
            >
              {showAllGroups ? 'Show Top 6' : `View All (15 Anatomical Groups)`}
            </Button>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* CARD 2: RECOVERY CONTEXT (14-DAY RESIDUAL STIMULUS) */}
      {/* ------------------------------------------------------------- */}
      <Card
        surface="default"
        variant="standard"
        padding="standard"
        className="flex flex-col justify-between"
      >
        <div>
          {/* Card Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                  Workload & Recency
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Trailing 14-day exponential decay ($t_{'{1/2}'} = 2d$)
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-zinc-500 uppercase">Window</span>
              <div className="text-xs font-mono text-zinc-400 tabular-nums">
                14 Days
              </div>
            </div>
          </div>

          {/* Model Disclaimer Notice */}
          <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
            Recency-weighted residual workload estimate · Derived from completed sets · Not measured physiological recovery.
          </p>

          {/* Recovery Item List or Empty State */}
          {!hasAnyResidual ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No recent stimulus recorded in the 14-day window.
            </div>
          ) : (
            <div className="space-y-3">
              {recoveryResult.items.slice(0, 6).map((item, idx) => {
                const hasRecent = item.lastTrainedInWindow !== null;
                const fillPercent = maxResidual > 0 ? (item.residualStimulus / maxResidual) * 100 : 0;

                return (
                  <div key={item.muscle} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-4 font-mono text-[10px] text-zinc-500 tabular-nums text-right">
                          #{idx + 1}
                        </span>
                        <span className="font-medium text-zinc-200 group-hover:text-white transition-colors">
                          {item.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        {/* Recency Context */}
                        <span className={cn(
                          "text-[11px] font-mono tabular-nums",
                          hasRecent ? "text-zinc-300" : "text-zinc-500"
                        )}>
                          {item.relativeLabel}
                        </span>

                        {/* Residual Score with 2-decimal precision */}
                        <span className="w-18 font-mono font-bold text-xs text-emerald-400 tabular-nums">
                          {item.residualStimulus.toFixed(2)} <span className="text-[10px] text-zinc-500 font-normal">res</span>
                        </span>
                      </div>
                    </div>

                    {/* Activity Bar */}
                    <div className="h-1.5 w-full bg-zinc-950/80 rounded-full overflow-hidden border border-zinc-800/40">
                      {item.residualStimulus > 0 && (
                        <div
                          className={cn("h-full bg-emerald-500/80 group-hover:bg-emerald-400 rounded-full", TRANSITION.progressBar)}
                          style={{ width: `${Math.max(fillPercent, 3)}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Context / Lifetime History Info */}
        <div className={cn("mt-4 pt-3 border-t flex items-center justify-between text-[11px] text-zinc-500", BORDER.subtle)}>
          <span>Decay model: 2-day half-life exponential residual</span>
          <span className="font-mono text-zinc-400">
            {hasAnyResidual ? `Peak: ${recoveryResult.items[0]?.label}` : 'No recent stimulus'}
          </span>
        </div>
      </Card>
    </div>
  );
};
