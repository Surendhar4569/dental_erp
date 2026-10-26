import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Enterprise Page Header with Breadcrumbs & Action Buttons
 */
export const PageHeader = ({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  children,
  className = '',
}) => {
  return (
    <div className={`mb-6 pb-4 border-b border-slate-200/80 ${className}`}>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center space-x-1.5 text-[11px] text-slate-400 mb-2 font-medium">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                {isLast || !item.onClick ? (
                  <span className={isLast ? 'text-slate-800 font-semibold' : 'hover:text-slate-600'}>
                    {item.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="hover:text-slate-700 transition"
                  >
                    {item.label}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center space-x-2.5 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

export default PageHeader;
