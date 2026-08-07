import React from 'react';
import { Card, CardProps } from './Card';
import { SectionHeader, SectionHeaderProps, SectionSize, HeadingLevel } from './SectionHeader';
import { SemanticColor, SpacingIntent } from '../../styles/tokens';
import { cn } from '../../lib/utils';

export interface SectionProps extends Omit<CardProps, 'size' | 'title'> {
  eyebrow?: string;
  eyebrowColor?: SemanticColor | null;
  colorOverride?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  size?: SectionSize;
  headingLevel?: HeadingLevel;
  headerProps?: Partial<SectionHeaderProps>;
  headerClassName?: string;
  padding?: SpacingIntent;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  eyebrow,
  eyebrowColor,
  colorOverride,
  title,
  description,
  action,
  size = 'section',
  headingLevel,
  headerProps,
  headerClassName,
  variant = 'panel',
  padding = 'section',
  className,
  children,
  ...cardProps
}) => {
  const combinedHeaderProps: SectionHeaderProps = {
    eyebrow,
    eyebrowColor,
    colorOverride: colorOverride || cardProps.colorOverride,
    title,
    description,
    action,
    size,
    headingLevel,
    ...headerProps,
    className: cn("mb-6", headerClassName, headerProps?.className),
  };

  const hasHeader = Boolean(
    combinedHeaderProps.title ||
    combinedHeaderProps.eyebrow ||
    combinedHeaderProps.action ||
    combinedHeaderProps.description
  );

  return (
    <Card
      variant={variant}
      padding={padding}
      colorOverride={colorOverride}
      className={className}
      {...cardProps}
    >
      {hasHeader && <SectionHeader {...combinedHeaderProps} />}
      {children}
    </Card>
  );
};

