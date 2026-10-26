import React from 'react';

/**
 * LeadSquared-inspired compact enterprise Metric Card
 */
export const MetricCard = ({
  title,
  value,
  subtext,
  icon: Icon,
  variant = 'slate', // 'slate' | 'teal' | 'emerald' | 'indigo' | 'amber'
  action,
  actionText,
  className = '',
}) => {
  const variantStyles = {
    slate: {
      iconBg: 'bg-slate-100 text-slate-700 border-slate-200',
      valueColor: 'text-slate-900',
    },
    teal: {
      iconBg: 'bg-teal-50 text-teal-700 border-teal-200/80',
      valueColor: 'text-teal-900',
    },
    emerald: {
      iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      valueColor: 'text-emerald-900',
    },
    indigo: {
      iconBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
      valueColor: 'text-indigo-900',
    },
    amber: {
      iconBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
      valueColor: 'text-amber-900',
    },
  };

  const currentVariant = variantStyles[variant] || variantStyles.slate;

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {title}
          </span>
          <div className={`text-2xl font-bold tracking-tight mt-1 ${currentVariant.valueColor}`}>
            {value}
          </div>
        </div>

        {Icon && (
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${currentVariant.iconBg}`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      {(subtext || (action && actionText)) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          {subtext && <span className="truncate pr-2">{subtext}</span>}
          {action && actionText && (
            <button
              type="button"
              onClick={action}
              className="text-teal-700 hover:text-teal-900 font-semibold text-[11px] shrink-0 transition"
            >
              {actionText} &rarr;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
