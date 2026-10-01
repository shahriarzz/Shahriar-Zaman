import React, { useState } from 'react';
import { Shield, ExternalLink } from 'lucide-react';
import { useFitness } from '../context/FitnessContext';
import { ProgramIdentityCard } from './manage/ProgramIdentityCard';
import { AccountSection } from './manage/AccountSection';
import { DataMaintenanceSection } from './manage/DataMaintenanceSection';
import { PrivacyPolicyModal } from './manage/PrivacyPolicyModal';
import { ProgramEditor } from './manage/ProgramEditor';
import { SectionHeader, Stack, Button, TYPOGRAPHY } from './ui';
import { cn } from '../lib/utils';

export const ManageView: React.FC = () => {
  const { workouts } = useFitness();
  const [isEditingProgram, setIsEditingProgram] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // If in drill-down Program Editor flow, render ProgramEditor
  if (isEditingProgram) {
    return (
      <div className="pt-4 pb-12">
        <ProgramEditor onBackToManage={() => setIsEditingProgram(false)} />
      </div>
    );
  }

  return (
    <Stack spacing="xl" className="pt-4 pb-12">
      {/* Top Page Header */}
      <SectionHeader
        eyebrow="System & Training"
        eyebrowColor="zinc"
        title="Manage"
        size="page"
      />

      {/* 1. PRIMARY ZONE: PROGRAM IDENTITY */}
      <ProgramIdentityCard
        workouts={workouts}
        onEditProgram={() => setIsEditingProgram(true)}
      />

      {/* 2. SECONDARY ZONE: ACCOUNT & SYNCHRONIZATION */}
      <AccountSection />

      {/* 3. SECONDARY ZONE: DATA & MAINTENANCE */}
      <DataMaintenanceSection />

      {/* 4. LEGAL & PRIVACY FOOTER */}
      <div className="pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-zinc-500">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPrivacyPolicy(true)}
            icon={<Shield size={14} className="text-emerald-400" />}
            className="text-zinc-400 hover:text-white"
          >
            Privacy Policy & Data Safety
          </Button>
        </div>
        <div className={cn(TYPOGRAPHY.micro, "text-zinc-600")}>
          GAINLOG Protocol v1.0.0 · Build 1
        </div>
      </div>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />
    </Stack>
  );
};
