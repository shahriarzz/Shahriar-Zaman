import React from 'react';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';
import { SemanticColor } from '../../styles/tokens';

export interface SectionProps {
  eyebrow?: string;
  eyebrowColor?: SemanticColor | string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'page' | 'section' | 'subsection' | 'lg' | 'md' | 'sm';
  padding?: 'none' | 'compact' | 'sm' | 'md' | 'lg' | 'relaxed' | 'hero';
  className?: string;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  eyebrow,
  eyebrowColor,
  title,
  description,
  action,
  size = 'section',
  padding = 'lg',
  className,
  children
}) => {
  return (
    <Card variant="panel" padding={padding} className={className}>
      <SectionHeader
        eyebrow={eyebrow}
        eyebrowColor={eyebrowColor}
        title={title}
        description={description}
        action={action}
        size={size}
      />
      {children}
    </Card>
  );
};
