import React from 'react';
import { Search, X } from 'lucide-react';
import { Input, Button } from '../ui';

interface HistoryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  onClear: () => void;
  initialDate?: string | null;
}

export const HistoryFilters: React.FC<HistoryFiltersProps> = ({
  search,
  onSearchChange,
  onClear,
  initialDate
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          type="text"
          placeholder="Search by date, exercise, or workout name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-9 text-xs"
        />
        {search && (
          <button
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {initialDate && (
        <Button variant="outline" size="sm" onClick={onClear} className="shrink-0 text-xs">
          Clear Date Filter
        </Button>
      )}
    </div>
  );
};
