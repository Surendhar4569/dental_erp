import React from 'react';

/**
 * Enterprise Status Badge inspired by LeadSquared CRM
 * Displays compact status indicators with subtle borders and clear typography.
 */
export const StatusBadge = ({ 
  status = 'active', 
  label, 
  size = 'sm', 
  dot = true,
  className = '' 
}) => {
  const normalized = (status || '').toLowerCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';
  let defaultLabel = label || status;

  if (normalized === 'active' || normalized === 'true' || normalized === 'online' || normalized === 'connected') {
    styles = 'bg-emerald-50 text-emerald-800 border-emerald-200/90';
    dotColor = 'bg-emerald-500';
    defaultLabel = label || 'Active';
  } else if (normalized === 'inactive' || normalized === 'false' || normalized === 'disabled' || normalized === 'disconnected') {
    styles = 'bg-slate-100 text-slate-600 border-slate-200';
    dotColor = 'bg-slate-400';
    defaultLabel = label || 'Inactive';
  } else if (normalized === 'default' || normalized === 'hq') {
    styles = 'bg-amber-50 text-amber-900 border-amber-200';
    dotColor = 'bg-amber-500';
    defaultLabel = label || 'Default HQ';
  } else if (normalized === 'upcoming' || normalized === 'planned') {
    styles = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    dotColor = 'bg-indigo-400';
    defaultLabel = label || 'Upcoming';
  } else if (normalized === 'primary' || normalized === 'branch') {
    styles = 'bg-teal-50 text-teal-800 border-teal-200';
    dotColor = 'bg-teal-500';
    defaultLabel = label || 'Primary';
  }

  const sizeClasses = size === 'xs' 
    ? 'text-[10px] px-1.5 py-0.5' 
    : 'text-[11px] px-2 py-0.5';

  return (
    <span 
      className={`inline-flex items-center font-medium border rounded-md tracking-tight ${sizeClasses} ${styles} ${className}`}
    >
      {dot && (
        <span 
          className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${dotColor} ${
            normalized === 'active' || normalized === 'connected' ? 'animate-pulse' : ''
          }`} 
        />
      )}
      <span>{defaultLabel}</span>
    </span>
  );
};

export default StatusBadge;
