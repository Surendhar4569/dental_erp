import React from 'react';
import { isAnterior, getToothName } from '../../../utils/dentalNotation';

/**
 * Anatomical 5-Surface FDI Tooth Component for Odontogram
 * Renders SVG tooth crown with clickable Mesial, Distal, Occlusal/Incisal, Buccal, Lingual surfaces
 * and visual overlays for missing, crown, RCT, implant, and surface restorations.
 */
export const ToothGraphic = ({
  toothNumber,
  baselineConditions = [], // array of { surface, condition_code, color_hex, badge_symbol }
  visitFindings = [], // array of findings recorded during this visit
  isSelected = false,
  onSelectTooth,
  onSelectSurface,
  arch = 'upper', // 'upper' | 'lower'
  isReadOnly = false,
}) => {
  const isAnt = isAnterior(toothNumber);
  const toothName = getToothName(toothNumber);

  // Combine conditions for visual rendering (visit findings take precedence or merge with baseline)
  const allConditions = [...baselineConditions, ...visitFindings];

  // Whole tooth conditions
  const isMissing = allConditions.some((c) => c.condition_code === 'missing');
  const isCrown = allConditions.some((c) => c.condition_code === 'crown');
  const isRct = allConditions.some((c) => c.condition_code === 'root_canal');
  const isImplant = allConditions.some((c) => c.condition_code === 'implant');
  const isFractured = allConditions.some((c) => c.condition_code === 'fracture');
  const isMobility = allConditions.some((c) => c.condition_code === 'mobility');
  const isImpacted = allConditions.some((c) => c.condition_code === 'impacted');

  // Surface condition lookup helper
  const getSurfaceColor = (surfaceCode) => {
    // Check if whole tooth has a dominant color
    if (isMissing) return '#E2E8F0'; // Slate-200
    if (isCrown) return '#FEF3C7'; // Amber-100

    // Find any condition matching this surface
    const match = allConditions.find(
      (c) => c.surface && c.surface.toUpperCase().includes(surfaceCode)
    );
    if (match) {
      if (match.condition_code === 'caries') return '#FCA5A5'; // Red-300
      if (match.condition_code === 'composite') return '#BAE6FD'; // Sky-200
      if (match.condition_code === 'amalgam') return '#94A3B8'; // Slate-400
      if (match.condition_code === 'restoration') return '#BFDBFE'; // Blue-200
      if (match.condition_code === 'fracture') return '#FED7AA'; // Orange-200
      if (match.condition_code === 'attrition_erosion') return '#FDE68A'; // Amber-200
      return match.color_hex || '#CBD5E1';
    }
    return '#FFFFFF';
  };

  const getSurfaceBorder = (surfaceCode) => {
    const match = allConditions.find(
      (c) => c.surface && c.surface.toUpperCase().includes(surfaceCode)
    );
    if (match) {
      if (match.condition_code === 'caries') return '#DC2626'; // Red-600
      if (match.condition_code === 'composite') return '#0284C7'; // Sky-600
      if (match.condition_code === 'amalgam') return '#475569'; // Slate-600
      if (match.condition_code === 'restoration') return '#2563EB'; // Blue-600
      return match.color_hex || '#64748B';
    }
    return '#94A3B8';
  };

  // Determine surface orientation based on quadrant
  // For upper arch (18-11, 21-28):
  //   18-11 (Quadrant 1): Mesial is toward right (toward midline), Distal is left.
  //   21-28 (Quadrant 2): Mesial is toward left (toward midline), Distal is right.
  // For lower arch (48-41, 31-38):
  //   48-41 (Quadrant 4): Mesial is toward right, Distal is left.
  //   31-38 (Quadrant 3): Mesial is toward left, Distal is right.
  const isRightSide = [1, 4, 5, 8].includes(Math.floor(toothNumber / 10));
  const leftSurfaceCode = isRightSide ? 'D' : 'M';
  const rightSurfaceCode = isRightSide ? 'M' : 'D';
  const topSurfaceCode = arch === 'upper' ? 'B' : 'L';
  const bottomSurfaceCode = arch === 'upper' ? 'L' : 'B';
  const centerSurfaceCode = isAnt ? 'I' : 'O';

  // Handle clicking a surface
  const handleSurfaceClick = (e, surfaceCode) => {
    e.stopPropagation();
    if (onSelectSurface) {
      onSelectSurface(toothNumber, surfaceCode);
    } else if (onSelectTooth) {
      onSelectTooth(toothNumber);
    }
  };

  return (
    <div
      className={`group relative flex flex-col items-center p-1.5 rounded-lg transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-teal-50 ring-2 ring-teal-500 shadow-md scale-105 z-20'
          : 'hover:bg-slate-50 hover:shadow-sm hover:scale-102'
      }`}
      onClick={() => onSelectTooth && onSelectTooth(toothNumber)}
      title={`${toothName} (FDI #${toothNumber})`}
      role="button"
      tabIndex={0}
      aria-label={`${toothName}, Tooth #${toothNumber}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectTooth && onSelectTooth(toothNumber);
        }
      }}
    >
      {/* Upper Arch Numbering Header */}
      {arch === 'upper' && (
        <span
          className={`text-[11px] font-bold tracking-tight mb-1 font-mono transition-colors ${
            isSelected
              ? 'text-teal-700 font-extrabold'
              : isMissing
              ? 'text-slate-400 line-through'
              : 'text-slate-700'
          }`}
        >
          {toothNumber}
        </span>
      )}

      {/* SVG Anatomical Tooth Representation */}
      <div className="relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-2xs overflow-visible"
        >
          {/* Root Guide Lines (Subtle clinical indicator) */}
          <path
            d={arch === 'upper' ? 'M 30,12 L 30,0 M 70,12 L 70,0' : 'M 30,88 L 30,100 M 70,88 L 70,100'}
            stroke={isMissing ? '#CBD5E1' : '#CBD5E1'}
            strokeWidth="1.5"
            strokeDasharray={isRct ? 'none' : '2,2'}
            className={isRct ? 'stroke-purple-500 stroke-2' : ''}
          />

          {/* 1. Top Surface (Buccal on Upper / Lingual on Lower) */}
          <polygon
            points="15,15 85,15 70,32 30,32"
            fill={getSurfaceColor(topSurfaceCode)}
            stroke={getSurfaceBorder(topSurfaceCode)}
            strokeWidth="2"
            className="transition-colors hover:fill-teal-100 hover:stroke-teal-600"
            onClick={(e) => handleSurfaceClick(e, topSurfaceCode)}
          >
            <title>{`${topSurfaceCode === 'B' ? 'Buccal / Facial' : 'Lingual'} Surface (${topSurfaceCode})`}</title>
          </polygon>

          {/* 2. Left Surface (Mesial or Distal based on Quadrant) */}
          <polygon
            points="15,15 30,32 30,68 15,85"
            fill={getSurfaceColor(leftSurfaceCode)}
            stroke={getSurfaceBorder(leftSurfaceCode)}
            strokeWidth="2"
            className="transition-colors hover:fill-teal-100 hover:stroke-teal-600"
            onClick={(e) => handleSurfaceClick(e, leftSurfaceCode)}
          >
            <title>{`${leftSurfaceCode === 'M' ? 'Mesial' : 'Distal'} Surface (${leftSurfaceCode})`}</title>
          </polygon>

          {/* 3. Center Surface: Occlusal (O) for Posteriors vs Incisal (I) for Anteriors */}
          {isAnt ? (
            // Incisal edge: Horizontal central band
            <polygon
              points="30,42 70,42 70,58 30,58"
              fill={getSurfaceColor('I')}
              stroke={getSurfaceBorder('I')}
              strokeWidth="2"
              className="transition-colors hover:fill-teal-100 hover:stroke-teal-600"
              onClick={(e) => handleSurfaceClick(e, 'I')}
            >
              <title>Incisal Edge (I)</title>
            </polygon>
          ) : (
            // Occlusal surface: Central trapezoid
            <polygon
              points="30,32 70,32 70,68 30,68"
              fill={getSurfaceColor('O')}
              stroke={getSurfaceBorder('O')}
              strokeWidth="2"
              className="transition-colors hover:fill-teal-100 hover:stroke-teal-600"
              onClick={(e) => handleSurfaceClick(e, 'O')}
            >
              <title>Occlusal Chewing Surface (O)</title>
            </polygon>
          )}

          {/* 4. Right Surface (Distal or Mesial based on Quadrant) */}
          <polygon
            points="85,15 85,85 70,68 70,32"
            fill={getSurfaceColor(rightSurfaceCode)}
            stroke={getSurfaceBorder(rightSurfaceCode)}
            strokeWidth="2"
            className="transition-colors hover:fill-teal-100 hover:stroke-teal-600"
            onClick={(e) => handleSurfaceClick(e, rightSurfaceCode)}
          >
            <title>{`${rightSurfaceCode === 'M' ? 'Mesial' : 'Distal'} Surface (${rightSurfaceCode})`}</title>
          </polygon>

          {/* 5. Bottom Surface (Lingual on Upper / Buccal on Lower) */}
          <polygon
            points="30,68 70,68 85,85 15,85"
            fill={getSurfaceColor(bottomSurfaceCode)}
            stroke={getSurfaceBorder(bottomSurfaceCode)}
            strokeWidth="2"
            className="transition-colors hover:fill-teal-100 hover:stroke-teal-600"
            onClick={(e) => handleSurfaceClick(e, bottomSurfaceCode)}
          >
            <title>{`${bottomSurfaceCode === 'B' ? 'Buccal / Facial' : 'Lingual'} Surface (${bottomSurfaceCode})`}</title>
          </polygon>

          {/* Crown Condition Visual Overlay */}
          {isCrown && (
            <rect
              x="12"
              y="12"
              width="76"
              height="76"
              rx="8"
              fill="none"
              stroke="#D97706"
              strokeWidth="3.5"
              strokeDasharray="4,2"
              className="animate-pulse"
            />
          )}

          {/* Root Canal Therapy (RCT) Vertical Purple Canal Line */}
          {isRct && (
            <line
              x1="50"
              y1="8"
              x2="50"
              y2="92"
              stroke="#7C3AED"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}

          {/* Missing Tooth Big Diagonal Red/Slate ✕ Overlay */}
          {isMissing && (
            <g stroke="#64748B" strokeWidth="4.5" strokeLinecap="round">
              <line x1="12" y1="12" x2="88" y2="88" />
              <line x1="88" y1="12" x2="12" y2="88" />
            </g>
          )}

          {/* Fracture Jagged Lightning Overlay */}
          {isFractured && !isMissing && (
            <path
              d="M 25,15 L 45,45 L 35,55 L 75,85"
              fill="none"
              stroke="#EA580C"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}

          {/* Implant Anchor Icon Overlay */}
          {isImplant && (
            <circle
              cx="50"
              cy="50"
              r="14"
              fill="#0D9488"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          )}
        </svg>

        {/* Floating Special Condition Badges */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {isImplant && (
            <span className="text-[10px] font-bold text-white leading-none">IMP</span>
          )}
          {isCrown && !isImplant && !isMissing && (
            <span className="text-[11px] font-bold text-amber-700 leading-none drop-shadow-xs">👑</span>
          )}
        </div>
      </div>

      {/* Lower Arch Numbering Footer */}
      {arch === 'lower' && (
        <span
          className={`text-[11px] font-bold tracking-tight mt-1 font-mono transition-colors ${
            isSelected
              ? 'text-teal-700 font-extrabold'
              : isMissing
              ? 'text-slate-400 line-through'
              : 'text-slate-700'
          }`}
        >
          {toothNumber}
        </span>
      )}

      {/* Condition Summary Badges Pill */}
      {allConditions.length > 0 && (
        <div className="flex items-center space-x-0.5 mt-0.5 max-w-[52px] overflow-hidden">
          {allConditions.slice(0, 2).map((c, idx) => (
            <span
              key={idx}
              className="text-[8px] font-bold px-1 py-0.2 rounded-xs leading-none shrink-0"
              style={{
                backgroundColor: c.color_hex ? `${c.color_hex}25` : '#E2E8F0',
                color: c.color_hex || '#334155',
                border: `1px solid ${c.color_hex || '#94A3B8'}`,
              }}
              title={`${c.condition_name || c.condition_code} ${c.surface ? `(${c.surface})` : ''}`}
            >
              {c.badge_symbol || c.condition_code.slice(0, 2).toUpperCase()}
            </span>
          ))}
          {allConditions.length > 2 && (
            <span className="text-[7px] text-slate-500 font-bold leading-none">
              +{allConditions.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ToothGraphic;
