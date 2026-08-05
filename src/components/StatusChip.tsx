import React from 'react';
import { Badge, BadgeProps } from './ui/Badge';

export type StatusChipProps = BadgeProps;
export const StatusChip: React.FC<StatusChipProps> = Badge;
export default StatusChip;
