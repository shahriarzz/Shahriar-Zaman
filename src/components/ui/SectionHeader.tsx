import React from 'react';
import { cn } from '../../lib/utils';
import {
  SemanticColor,
  getAccentColor,
  TYPOGRAPHY
} from '../../styles/tokens';

export interface SectionHeaderProps {
  eyebrow?: string;
  eyebrowColor?: SemanticColor | string;
  title: string;
  description?: string;
  subtitle?: string;
  action?: React.ReactNode;
  size?: 'page' | 'section' | 'subsection' | 'lg' | 'md' | 'sm';
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  eyebrow,
  eyebrowColor = 'emerald',
  title,
  description,
  subtitle,
  action,
  size = 'section',
  className
}) => {
  const eyebrowHex = getAccentColor(eyebrowColor) || '#10b981';
  const effectiveDescription = description || subtitle;

  const titleClasses: Record<string, string> = {
    page: TYPOGRAPHY.titlePage,
    section: TYPOGRAPHY.titleSection,
    subsection: TYPOGRAPHY.titleSubsection,
    lg: TYPOGRAPHY.titlePage,
    md: TYPOGRAPHY.titleSection,
    sm: TYPOGRAPHY.titleSubsection
  };

  const selectedTitleClass = titleClasses[size] || TYPOGRAPHY.titleSection;

  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div className="space-y-1 min-w-0">
        {eyebrow && (
          <p
            className={TYPOGRAPHY.eyebrow}
            style={{ color: eyebrowHex }}
          >
            {eyebrow}
          </p>
        )}
        <h3 className={selectedTitleClass}>
          {title}
        </h3>
        {effectiveDescription && (
          <p className={TYPOGRAPHY.body}>
            {effectiveDescription}
          </p>
        )}
      </div>

      {action && (
        <div className="shrink-0 flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
};
