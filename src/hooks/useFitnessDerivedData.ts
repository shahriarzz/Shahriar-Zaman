import { useContext } from 'react';
import { FitnessDerivedContext, FitnessDerivedData } from '../context/FitnessDerivedContext';

export type { FitnessDerivedData };

/**
 * High-performance canonical consumer hook backed entirely by FitnessDerivedContext.
 */
export function useFitnessDerivedData(): FitnessDerivedData {
  const context = useContext(FitnessDerivedContext);
  if (!context) {
    throw new Error('useFitnessDerivedData must be used within a FitnessDerivedProvider');
  }
  return context;
}
