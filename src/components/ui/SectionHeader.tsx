import React from 'react';
import { cn } from '../../lib/utils';
import {
  SemanticColor,
  getAccentColor,
  TYPOGRAPHY
} from '../../styles/tokens';

export type SectionSize = 'page' | 'section' | 'subsection';
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface SectionHeaderProps {
  eyebrow?: string;
  eyebrowColor?: SemanticColor | null;
  colorOverride?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  size?: SectionSize;
  headingLevel?: HeadingLevel;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  eyebrow,
  eyebrowColor = 'zinc',
  colorOverride,
  title,
  description,
  action,
  size = 'section',
  headingLevel,
  className
}) => {
  const eyebrowHex = colorOverride || getAccentColor(eyebrowColor as SemanticColor) || '#71717a';

  const titleClasses: Record<SectionSize, string> = {
    page: TYPOGRAPHY.titlePage,
    section: TYPOGRAPHY.titleSection,
    subsection: TYPOGRAPHY.titleSubsection,
  };

  const selectedTitleClass = (size && titleClasses[size]) || TYPOGRAPHY.titleSection;

  const HeadingTag = headingLevel || (
    size === 'page' ? 'h1' :
    size === 'subsection' ? 'h3' :
    'h2'
  );

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4", className)}>
      <div className="space-y-1 min-w-0 flex-1">
        {eyebrow && (
          <p
            className={TYPOGRAPHY.eyebrow}
            style={{ color: eyebrowHex }}
          >
            {eyebrow}
          </p>
        )}
        {title && (
          <HeadingTag className={selectedTitleClass}>
            {title}
          </HeadingTag>
        )}
        {description && (
          <p className={TYPOGRAPHY.body}>
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className="self-start sm:self-auto shrink-0 flex items-center gap-2 max-w-full overflow-x-auto pb-1 sm:pb-0">
          {action}
        </div>
      )}
    </div>
  );
};

