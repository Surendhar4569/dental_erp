/**
 * FDI World Dental Federation (ISO 3950) Tooth Numbering & Surface Validation Utilities
 */

// All valid permanent teeth (32 teeth)
const PERMANENT_TEETH = new Set([
  // Upper Right (Quadrant 1)
  18, 17, 16, 15, 14, 13, 12, 11,
  // Upper Left (Quadrant 2)
  21, 22, 23, 24, 25, 26, 27, 28,
  // Lower Left (Quadrant 3)
  38, 37, 36, 35, 34, 33, 32, 31,
  // Lower Right (Quadrant 4)
  41, 42, 43, 44, 45, 46, 47, 48,
]);

// All valid primary / deciduous teeth (20 teeth)
const PRIMARY_TEETH = new Set([
  // Upper Right (Quadrant 5)
  55, 54, 53, 52, 51,
  // Upper Left (Quadrant 6)
  61, 62, 63, 64, 65,
  // Lower Left (Quadrant 7)
  75, 74, 73, 72, 71,
  // Lower Right (Quadrant 8)
  81, 82, 83, 84, 85,
]);

// Anterior teeth: Central Incisors, Lateral Incisors, Canines
// These have Incisal (I) edges, NOT Occlusal (O) surfaces.
const ANTERIOR_TEETH = new Set([
  11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43, // Permanent
  51, 52, 53, 61, 62, 63, 71, 72, 73, 81, 82, 83, // Primary
]);

// Posterior teeth: Premolars & Molars
// These have Occlusal (O) surfaces, NOT Incisal (I) edges.
const POSTERIOR_TEETH = new Set([
  14, 15, 16, 17, 18, 24, 25, 26, 27, 28, 34, 35, 36, 37, 38, 44, 45, 46, 47, 48, // Permanent
  54, 55, 64, 65, 74, 75, 84, 85, // Primary
]);

// Tooth Anatomy Names Dictionary
const TOOTH_NAMES = {
  18: 'Maxillary Right Third Molar (Wisdom)',
  17: 'Maxillary Right Second Molar',
  16: 'Maxillary Right First Molar',
  15: 'Maxillary Right Second Premolar',
  14: 'Maxillary Right First Premolar',
  13: 'Maxillary Right Canine (Cuspid)',
  12: 'Maxillary Right Lateral Incisor',
  11: 'Maxillary Right Central Incisor',

  21: 'Maxillary Left Central Incisor',
  22: 'Maxillary Left Lateral Incisor',
  23: 'Maxillary Left Canine (Cuspid)',
  24: 'Maxillary Left First Premolar',
  25: 'Maxillary Left Second Premolar',
  26: 'Maxillary Left First Molar',
  27: 'Maxillary Left Second Molar',
  28: 'Maxillary Left Third Molar (Wisdom)',

  38: 'Mandibular Left Third Molar (Wisdom)',
  37: 'Mandibular Left Second Molar',
  36: 'Mandibular Left First Molar',
  35: 'Mandibular Left Second Premolar',
  34: 'Mandibular Left First Premolar',
  33: 'Mandibular Left Canine (Cuspid)',
  32: 'Mandibular Left Lateral Incisor',
  31: 'Mandibular Left Central Incisor',

  41: 'Mandibular Right Central Incisor',
  42: 'Mandibular Right Lateral Incisor',
  43: 'Mandibular Right Canine (Cuspid)',
  44: 'Mandibular Right First Premolar',
  45: 'Mandibular Right Second Premolar',
  46: 'Mandibular Right First Molar',
  47: 'Mandibular Right Second Molar',
  48: 'Mandibular Right Third Molar (Wisdom)',

  // Primary Teeth
  55: 'Primary Maxillary Right Second Molar',
  54: 'Primary Maxillary Right First Molar',
  53: 'Primary Maxillary Right Canine',
  52: 'Primary Maxillary Right Lateral Incisor',
  51: 'Primary Maxillary Right Central Incisor',

  61: 'Primary Maxillary Left Central Incisor',
  62: 'Primary Maxillary Left Lateral Incisor',
  63: 'Primary Maxillary Left Canine',
  64: 'Primary Maxillary Left First Molar',
  65: 'Primary Maxillary Left Second Molar',

  75: 'Primary Mandibular Left Second Molar',
  74: 'Primary Mandibular Left First Molar',
  73: 'Primary Mandibular Left Canine',
  72: 'Primary Mandibular Left Lateral Incisor',
  71: 'Primary Mandibular Left Central Incisor',

  81: 'Primary Mandibular Right Central Incisor',
  82: 'Primary Mandibular Right Lateral Incisor',
  83: 'Primary Mandibular Right Canine',
  84: 'Primary Mandibular Right First Molar',
  85: 'Primary Mandibular Right Second Molar',
};

/**
 * Check if tooth number is valid in FDI two-digit system
 */
const isValidToothNumber = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  return PERMANENT_TEETH.has(num) || PRIMARY_TEETH.has(num);
};

const isPermanentTooth = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  return PERMANENT_TEETH.has(num);
};

const isPrimaryTooth = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  return PRIMARY_TEETH.has(num);
};

const isAnteriorTooth = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  return ANTERIOR_TEETH.has(num);
};

const isPosteriorTooth = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  return POSTERIOR_TEETH.has(num);
};

const getToothName = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  return TOOTH_NAMES[num] || `Tooth #${toothNumber}`;
};

/**
 * Returns valid surfaces for a given tooth
 * - Anteriors: Mesial (M), Distal (D), Incisal (I), Buccal/Labial (B), Lingual/Palatal (L)
 * - Posteriors: Mesial (M), Distal (D), Occlusal (O), Buccal (B), Lingual/Palatal (L)
 */
const getValidSurfacesForTooth = (toothNumber) => {
  const num = parseInt(toothNumber, 10);
  if (!isValidToothNumber(num)) return [];

  if (isAnteriorTooth(num)) {
    return ['M', 'D', 'I', 'B', 'L'];
  }
  return ['M', 'D', 'O', 'B', 'L'];
};

/**
 * Validates and normalizes surface combinations (e.g. 'MOD', 'O', 'B', 'M')
 * Throws a descriptive validation error if an invalid surface is supplied.
 */
const normalizeAndValidateSurface = (toothNumber, rawSurface) => {
  const num = parseInt(toothNumber, 10);
  if (!isValidToothNumber(num)) {
    throw new Error(`Invalid FDI tooth number: ${toothNumber}. Must be a valid permanent (11-48) or primary (51-85) tooth.`);
  }

  if (!rawSurface || typeof rawSurface !== 'string' || !rawSurface.trim()) {
    return null;
  }

  const validSurfaces = getValidSurfacesForTooth(num);
  const isAnt = isAnteriorTooth(num);

  // Extract individual characters (ignoring spaces, commas, slashes)
  const cleaned = rawSurface.toUpperCase().replace(/[^A-Z]/g, '');
  const surfaceChars = Array.from(new Set(cleaned.split('')));

  if (surfaceChars.length === 0) {
    return null;
  }

  // Check each surface character against valid surfaces
  for (const s of surfaceChars) {
    // Map 'F' (facial) or 'V' (vestibular) to 'B' (buccal/labial), and 'P' (palatal) to 'L' (lingual/palatal)
    const normalizedChar = s === 'F' || s === 'V' ? 'B' : s === 'P' ? 'L' : s;

    if (normalizedChar === 'O' && isAnt) {
      throw new Error(`Invalid surface 'O' (Occlusal) on tooth #${num} (${getToothName(num)}). Anterior teeth have an Incisal (I) edge, not an Occlusal surface.`);
    }

    if (normalizedChar === 'I' && !isAnt) {
      throw new Error(`Invalid surface 'I' (Incisal) on tooth #${num} (${getToothName(num)}). Posterior teeth have an Occlusal (O) surface, not an Incisal edge.`);
    }

    if (!validSurfaces.includes(normalizedChar)) {
      throw new Error(`Invalid surface '${s}' for tooth #${num}. Valid surfaces are: ${validSurfaces.join(', ')}.`);
    }
  }

  // Canonical ordering: M, O, D, I, B, L
  const canonicalOrder = ['M', 'O', 'D', 'I', 'B', 'L'];
  const normalizedSet = new Set(
    surfaceChars.map((c) => (c === 'F' || c === 'V' ? 'B' : c === 'P' ? 'L' : c))
  );

  return canonicalOrder.filter((c) => normalizedSet.has(c)).join('');
};

module.exports = {
  PERMANENT_TEETH: Array.from(PERMANENT_TEETH),
  PRIMARY_TEETH: Array.from(PRIMARY_TEETH),
  ANTERIOR_TEETH: Array.from(ANTERIOR_TEETH),
  POSTERIOR_TEETH: Array.from(POSTERIOR_TEETH),
  isValidToothNumber,
  isPermanentTooth,
  isPrimaryTooth,
  isAnteriorTooth,
  isPosteriorTooth,
  getToothName,
  getValidSurfacesForTooth,
  normalizeAndValidateSurface,
};
