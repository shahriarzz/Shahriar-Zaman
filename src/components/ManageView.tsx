import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFitness } from '../store/FitnessContext';
import { ProgramIdentityCard } from './manage/ProgramIdentityCard';
import { AccountSection } from './manage/AccountSection';
import { DataMaintenanceSection } from './manage/DataMaintenanceSection';
import { ProgramEditor } from './manage/ProgramEditor';
import {
  SectionHeader,
  Stack,
  TYPOGRAPHY
} from './ui';

export const ManageView: React.FC = () => {
  const { workouts } = useFitness();
  const [isEditingProgram, setIsEditingProgram] = useState(false);

  // If in drill-down Program Editor flow, render ProgramEditor
  if (isEditingProgram) {
    return (
      <div className="pt-4 pb-12">
        <ProgramEditor onBackToManage={() => setIsEditingProgram(false)} />
      </div>
    );
  }

  return (
    <Stack spacing="xl" className="pt-4 pb-12 animate-in fade-in-50 duration-200">
      {/* Top Page Header */}
      <SectionHeader
        eyebrow="System & Training"
        eyebrowColor="zinc"
        title="Manage"
        size="page"
      />

      {/* 1. PRIMARY ZONE: PROGRAM IDENTITY */}
      <div className="space-y-2">
        <ProgramIdentityCard
          workouts={workouts}
          onEditProgram={() => setIsEditingProgram(true)}
        />
      </div>

      {/* 2. SECONDARY ZONE: ACCOUNT & SYNCHRONIZATION */}
      <AccountSection />

      {/* 3. SECONDARY ZONE: DATA & MAINTENANCE */}
      <DataMaintenanceSection />
    </Stack>
  );
};
