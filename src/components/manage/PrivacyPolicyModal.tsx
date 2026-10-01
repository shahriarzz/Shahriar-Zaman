import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Lock, Trash2, Database, Sparkles, CheckCircle2 } from 'lucide-react';
import { Card, Button, Badge, Stack, TYPOGRAPHY, RADIUS } from '../ui';
import { cn } from '../../lib/utils';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#09090e] border border-zinc-800 shadow-2xl overflow-hidden",
            RADIUS.card
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/40">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Shield size={18} />
              </div>
              <div>
                <h3 className={cn(TYPOGRAPHY.sectionTitle, "text-white")}>Privacy Policy & Data Safety</h3>
                <p className={cn(TYPOGRAPHY.micro, "text-zinc-400")}>Effective: October 2026 · GAINLOG Protocol</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={16} />} aria-label="Close dialog" />
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto p-6 space-y-6 text-zinc-300 text-sm leading-relaxed">
            {/* Summary Banner */}
            <Card variant="standard" surface="elevated" padding="compact" className="border-emerald-500/30 bg-emerald-500/[0.04]">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className={cn(TYPOGRAPHY.caption, "font-bold text-white")}>Offline-First & User-Owned Privacy</p>
                  <p className={cn(TYPOGRAPHY.micro, "text-zinc-400")}>
                    GAINLOG is architected as an offline-first fitness protocol tracker. Your personal workout data is stored locally on your device and only synced to your private cloud storage when you explicitly authenticate with Google.
                  </p>
                </div>
              </div>
            </Card>

            {/* Section 1: Data We Collect */}
            <section className="space-y-2">
              <h4 className={cn(TYPOGRAPHY.cardTitle, "text-white flex items-center gap-2")}>
                <Database size={15} className="text-emerald-400" />
                1. Data Collected & Processed
              </h4>
              <p className={cn(TYPOGRAPHY.caption, "text-zinc-400")}>
                GAINLOG collects only the fitness and account data necessary to provide training logs, cycle progression, and athletic analytics:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-zinc-400 text-xs">
                <li><strong className="text-zinc-200">Account Credentials:</strong> Google account email, name, and profile identifier when opting into Cloud Sync.</li>
                <li><strong className="text-zinc-200">Training & Workout Logs:</strong> Exercise names, completed sets, reps, load weight, session timestamps, and completion statuses.</li>
                <li><strong className="text-zinc-200">Bodyweight & Composition:</strong> User-logged bodyweight entries and timestamps for progress trend visualization.</li>
                <li><strong className="text-zinc-200">Calculated Metrics:</strong> Estimated 1RM (Epley formula), workout volume, cycle progression days, and calculated performance scores.</li>
              </ul>
            </section>

            {/* Section 2: AI Coaching & Gemini Processing */}
            <section className="space-y-2">
              <h4 className={cn(TYPOGRAPHY.cardTitle, "text-white flex items-center gap-2")}>
                <Sparkles size={15} className="text-emerald-400" />
                2. AI Coaching (Gemini API)
              </h4>
              <p className={cn(TYPOGRAPHY.caption, "text-zinc-400")}>
                When you request AI Coaching for an exercise, only the current exercise name, target rep range, and recent sets for that exercise are transmitted via secure HTTPS to Google Gemini. No personal identifying information (PII) is sent with coaching prompts, and your workout data is never used to train public foundational models.
              </p>
            </section>

            {/* Section 3: Cloud Storage & Security */}
            <section className="space-y-2">
              <h4 className={cn(TYPOGRAPHY.cardTitle, "text-white flex items-center gap-2")}>
                <Lock size={15} className="text-emerald-400" />
                3. Storage, Encryption & Third Parties
              </h4>
              <p className={cn(TYPOGRAPHY.caption, "text-zinc-400")}>
                Cloud synchronization is powered by Google Firebase Firestore. Data is encrypted in transit via TLS 1.3 and at rest via AES-256. Firestore security rules enforce strict user-level authorization: no user can read or write another athlete's data. We do not sell, rent, or monetize your training data.
              </p>
            </section>

            {/* Section 4: User Rights & Data Deletion */}
            <section className="space-y-2">
              <h4 className={cn(TYPOGRAPHY.cardTitle, "text-white flex items-center gap-2")}>
                <Trash2 size={15} className="text-emerald-400" />
                4. Data Ownership & Deletion Rights
              </h4>
              <p className={cn(TYPOGRAPHY.caption, "text-zinc-400")}>
                You retain complete ownership over your data at all times:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-zinc-400 text-xs">
                <li><strong className="text-zinc-200">Data Export:</strong> Export your full dataset in JSON format at any time from the Manage tab.</li>
                <li><strong className="text-zinc-200">Local Reset:</strong> Purge all local offline cache without affecting cloud storage.</li>
                <li><strong className="text-zinc-200">Account & Cloud Data Deletion:</strong> Permanently delete your cloud records and workout logs directly within app settings.</li>
              </ul>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/40">
            <Button variant="primary" size="sm" onClick={onClose}>
              Got It
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
