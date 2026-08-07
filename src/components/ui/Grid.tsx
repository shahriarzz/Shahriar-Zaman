import React from 'react';
import { cn } from '../../lib/utils';
import { GAP, GapSize } from '../../styles/tokens';

export type GridCols = 1 | 2 | 3 | 4 | 5 | 6 | 12;

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: GridCols;
  colsSm?: GridCols;
  colsMd?: GridCols;
  colsLg?: GridCols;
  colsXl?: GridCols;
  gap?: GapSize;
  children?: React.ReactNode;
}

const COLS_MAP: Record<GridCols, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
};

const COLS_SM_MAP: Record<GridCols, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
  12: 'sm:grid-cols-12',
};

const COLS_MD_MAP: Record<GridCols, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
};

const COLS_LG_MAP: Record<GridCols, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
};

const COLS_XL_MAP: Record<GridCols, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  12: 'xl:grid-cols-12',
};

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(({
  cols = 1,
  colsSm,
  colsMd,
  colsLg,
  colsXl,
  gap = 'md',
  className,
  children,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "grid",
        COLS_MAP[cols],
        colsSm && COLS_SM_MAP[colsSm],
        colsMd && COLS_MD_MAP[colsMd],
        colsLg && COLS_LG_MAP[colsLg],
        colsXl && COLS_XL_MAP[colsXl],
        GAP[gap],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Grid.displayName = 'Grid';
