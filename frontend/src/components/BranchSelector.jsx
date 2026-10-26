import React from 'react';
import { useBranch } from '../context/BranchContext';
import { MapPin } from 'lucide-react';

export const BranchSelector = () => {
  const { activeBranch } = useBranch();

  if (!activeBranch) return null;

  return (
    <div 
      className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium select-none"
      title={`Authorized Location: ${activeBranch.branch_name}`}
      id="assigned-branch-badge"
    >
      <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
      <div className="text-left flex flex-col leading-tight">
        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
          Assigned Branch
        </span>
        <span className="font-semibold text-slate-900 truncate max-w-[140px] sm:max-w-[180px]">
          {activeBranch.branch_name}
        </span>
      </div>
      {activeBranch.branch_code && (
        <span className="font-mono text-[10px] bg-teal-50 text-teal-800 border border-teal-200/60 px-1.5 py-0.5 rounded font-bold">
          {activeBranch.branch_code}
        </span>
      )}
    </div>
  );
};

export default BranchSelector;
