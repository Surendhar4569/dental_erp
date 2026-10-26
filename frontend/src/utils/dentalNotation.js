/**
 * FDI World Dental Federation (ISO 3950) Tooth Numbering & Surface Utility
 */

export const PERMANENT_QUADRANTS = {
  upperRight: [18, 17, 16, 15, 14, 13, 12, 11],
  upperLeft: [21, 22, 23, 24, 25, 26, 27, 28],
  lowerLeft: [38, 37, 36, 35, 34, 33, 32, 31],
  lowerRight: [41, 42, 43, 44, 45, 46, 47, 48],
};

export const PRIMARY_QUADRANTS = {
  upperRight: [55, 54, 53, 52, 51],
  upperLeft: [61, 62, 63, 64, 65],
  lowerLeft: [75, 74, 73, 72, 71],
  lowerRight: [81, 82, 83, 84, 85],
};

export const ANTERIOR_TEETH = new Set([
  11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43,
  51, 52, 53, 61, 62, 63, 71, 72, 73, 81, 82, 83,
]);

export const POSTERIOR_TEETH = new Set([
  14, 15, 16, 17, 18, 24, 25, 26, 27, 28, 34, 35, 36, 37, 38, 44, 45, 46, 47, 48,
  54, 55, 64, 65, 74, 75, 84, 85,
]);

export const TOOTH_NAMES = {
  18: 'Maxillary Right Third Molar (Wisdom)',
  17: 'Maxillary Right Second Molar',
  16: 'Maxillary Right First Molar',
  15: 'Maxillary Right Second Premolar',
  14: 'Maxillary Right First Premolar',
  13: 'Maxillary Right Canine',
  12: 'Maxillary Right Lateral Incisor',
  11: 'Maxillary Right Central Incisor',

  21: 'Maxillary Left Central Incisor',
  22: 'Maxillary Left Lateral Incisor',
  23: 'Maxillary Left Canine',
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
  33: 'Mandibular Left Canine',
  32: 'Mandibular Left Lateral Incisor',
  31: 'Mandibular Left Central Incisor',

  41: 'Mandibular Right Central Incisor',
  42: 'Mandibular Right Lateral Incisor',
  43: 'Mandibular Right Canine',
  44: 'Mandibular Right First Premolar',
  45: 'Mandibular Right Second Premolar',
  46: 'Mandibular Right First Molar',
  47: 'Mandibular Right Second Molar',
  48: 'Mandibular Right Third Molar (Wisdom)',

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

export const SURFACE_DESCRIPTIONS = {
  M: { code: 'M', name: 'Mesial', description: 'Surface facing toward the midline' },
  D: { code: 'D', name: 'Distal', description: 'Surface facing away from the midline' },
  O: { code: 'O', name: 'Occlusal', description: 'Biting/chewing surface of premolars and molars' },
  I: { code: 'I', name: 'Incisal', description: 'Cutting edge of incisors and canines' },
  B: { code: 'B', name: 'Buccal / Facial', description: 'Surface facing the cheeks or lips' },
  L: { code: 'L', name: 'Lingual / Palatal', description: 'Surface facing the tongue or palate' },
};

export const isAnterior = (toothNumber) => ANTERIOR_TEETH.has(Number(toothNumber));
export const isPosterior = (toothNumber) => POSTERIOR_TEETH.has(Number(toothNumber));

export const getValidSurfaces = (toothNumber) => {
  const num = Number(toothNumber);
  if (isAnterior(num)) {
    return ['M', 'D', 'I', 'B', 'L'];
  }
  return ['M', 'D', 'O', 'B', 'L'];
};

export const getToothName = (toothNumber) => {
  return TOOTH_NAMES[Number(toothNumber)] || `Tooth #${toothNumber}`;
};

export const isPermanentTooth = (toothNumber) => {
  const n = Number(toothNumber);
  return (n >= 11 && n <= 18) || (n >= 21 && n <= 28) || (n >= 31 && n <= 38) || (n >= 41 && n <= 48);
};

export const isPrimaryTooth = (toothNumber) => {
  const n = Number(toothNumber);
  return (n >= 51 && n <= 55) || (n >= 61 && n <= 65) || (n >= 71 && n <= 75) || (n >= 81 && n <= 85);
};

export const isValidToothNumber = (toothNumber) => {
  return isPermanentTooth(toothNumber) || isPrimaryTooth(toothNumber);
};

