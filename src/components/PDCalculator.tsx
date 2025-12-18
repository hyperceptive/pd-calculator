import React, { useState, useMemo, useCallback } from 'react';
import { Calculator, AlertCircle } from 'lucide-react';

// ============================================================================
// SECTION 1: TYPES AND INTERFACES
// ============================================================================

type FillMode = 'low' | 'standard';
type PDMode = 'cycles' | 'tidal';
type CalculationMode = 'solveCycles' | 'solveTotalVolume';

interface IncrementRange {
  range: [number, number];
  increment: number;
}

interface IncrementRules {
  fillVolume: IncrementRange[];
  totalVolume: IncrementRange[];
}

interface ValidationResult {
  valid: boolean;
  message?: string;
}

interface RoundingResult {
  rounded: number;
  wasRounded: boolean;
  increment?: number;
  outOfRange?: boolean;
  message?: string;
}

interface TotalVolumeResult {
  calculated: number;
  programmable: number;
  difference: number;
  needsRounding: boolean;
  increment?: number;
  outOfRange?: boolean;
  errorMessage?: string;
  cycles?: number;
  tidalVolume?: number;
  fullDrainVolume?: number;
  lastFill?: number;
  fullDrainCount?: number;
  tidalDrainCycles?: number;
}

interface TidalCyclesResult {
  cycles: number;
  calculatedTotal: number;
  requestedTotal: number;
  difference: number;
  tidalVolume: number;
  fullDrainVolume: number;
  fullDrainCount: number;
  tidalDrainCycles: number;
}

interface TimeBreakdown {
  timePerCycleHours: number;
  timePerCycleMinutes: number;
  dwellTimeMinutes: number;
  dwellTimeHours: number;
  fillTimeMinutes: number;
  drainTimeMinutes: number;
  totalDwellTimeHours: number;
  totalFillDrainTimeMinutes: number;
  totalTreatmentMinutes: number;
  error?: string;
}

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  focusColor: string;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

interface ResultDisplayProps {
  title: string;
  value: string | number;
  bgColor: string;
  borderColor: string;
  textColor: string;
  children?: React.ReactNode;
}

interface IncrementInfoProps {
  mode: FillMode;
}

interface TimeCalculationsDisplayProps {
  timeBreakdown: TimeBreakdown | null;
  treatmentTime: string;
}

// ============================================================================
// SECTION 2: CONSTANTS AND CONFIGURATION
// ============================================================================

const INCREMENT_RULES: Record<FillMode, IncrementRules> = {
  low: {
    fillVolume: [
      { range: [60, 100], increment: 1 },
      { range: [100, 500], increment: 10 },
      { range: [500, 1000], increment: 50 }
    ],
    totalVolume: [
      { range: [200, 2000], increment: 50 },
      { range: [2000, 20000], increment: 100 },
      { range: [20000, 80000], increment: 500 }
    ]
  },
  standard: {
    fillVolume: [
      { range: [100, 500], increment: 10 },
      { range: [500, 1000], increment: 50 },
      { range: [1000, 3000], increment: 100 }
    ],
    totalVolume: [
      { range: [200, 2000], increment: 50 },
      { range: [2000, 5000], increment: 100 },
      { range: [5000, 80000], increment: 500 }
    ]
  }
};

const MAX_TIDAL_CYCLES = 1000;
const FILL_DRAIN_TIME_MINUTES = 15;

const VALIDATION_MESSAGES = {
  invalidNumber: 'Please enter a valid number',
  fillTooLarge: 'Last fill must be less than or equal to fill volume',
  fillTooSmall: 'Fill volume must be greater than 0',
  allFieldsRequired: 'Please fill in all fields',
  tidalRange: 'Tidal percentage must be between 40 and 95',
  tidalIncrement: 'Tidal percentage must be in increments of 5% (40%, 45%, 50%, etc.)',
  fullDrainRange: 'Full drain interval must be between 1 and 10 cycles',
  fullDrainInteger: 'Full drain interval must be a whole number'
};

// ============================================================================
// SECTION 3: PURE CALCULATION FUNCTIONS
// ============================================================================

const calculateCyclesFromVolume = (
  totalVolume: number,
  lastFill: number,
  fillVolume: number
): number => {
  if (fillVolume === 0) return 0;
  return Math.floor((totalVolume - lastFill) / fillVolume);
};

const calculateVolumeFromCycles = (
  cycles: number,
  fillVolume: number,
  lastFill: number
): number => {
  return (cycles * fillVolume) + lastFill;
};

const calculateTimeBreakdown = (
  treatmentTimeHours: number,
  cycles: number
): TimeBreakdown | null => {
  if (!treatmentTimeHours || !cycles || cycles === 0) return null;
  
  const totalMinutes = treatmentTimeHours * 60;
  const fillDrainPerCycle = FILL_DRAIN_TIME_MINUTES;
  const totalFillDrainTime = fillDrainPerCycle * cycles;
  const totalDwellTime = totalMinutes - totalFillDrainTime;
  
  if (totalDwellTime < 0) {
    return { 
      error: 'Treatment time is too short for the number of cycles',
      timePerCycleHours: 0,
      timePerCycleMinutes: 0,
      dwellTimeMinutes: 0,
      dwellTimeHours: 0,
      fillTimeMinutes: 0,
      drainTimeMinutes: 0,
      totalDwellTimeHours: 0,
      totalFillDrainTimeMinutes: 0,
      totalTreatmentMinutes: 0
    };
  }
  
  const dwellTimePerCycle = totalDwellTime / cycles;
  const timePerCycle = totalMinutes / cycles;
  const fillTime = fillDrainPerCycle / 2;
  const drainTime = fillDrainPerCycle / 2;
  
  return {
    timePerCycleHours: timePerCycle / 60,
    timePerCycleMinutes: timePerCycle,
    dwellTimeMinutes: dwellTimePerCycle,
    dwellTimeHours: dwellTimePerCycle / 60,
    fillTimeMinutes: fillTime,
    drainTimeMinutes: drainTime,
    totalDwellTimeHours: totalDwellTime / 60,
    totalFillDrainTimeMinutes: totalFillDrainTime,
    totalTreatmentMinutes: totalMinutes
  };
};

const calculateTidalCyclesCount = (
  workingVolume: number,
  fillVolume: number,
  tidalDecimal: number,
  fullDrainInterval: number
): number => {
  let bestCycles = 0;
  
  for (let c = 1; c <= MAX_TIDAL_CYCLES; c++) {
    const fullDrainCount = Math.ceil(c / fullDrainInterval);
    const tidalDrainCycles = c - fullDrainCount;
    const calculatedVolume = (fillVolume * tidalDecimal * tidalDrainCycles) + (fullDrainCount * fillVolume);
    
    if (calculatedVolume <= workingVolume) {
      bestCycles = c;
    } else {
      break;
    }
  }
  
  return bestCycles;
};

const calculateVolumeFromTidalCycles = (
  cycles: number,
  fillVolume: number,
  lastFill: number,
  tidalDecimal: number,
  fullDrainInterval: number
): number => {
  const fullDrainCount = Math.ceil(cycles / fullDrainInterval);
  const tidalDrainCycles = cycles - fullDrainCount;
  
  const tidalVolume = fillVolume * tidalDecimal * tidalDrainCycles;
  const fullDrainVolume = fullDrainCount * fillVolume;
  
  return tidalVolume + fullDrainVolume + lastFill;
};

// ============================================================================
// SECTION 4: ROUNDING AND VALIDATION UTILITIES
// ============================================================================

const roundToValidIncrement = (
  value: number,
  type: 'fillVolume' | 'totalVolume',
  mode: FillMode
): RoundingResult => {
  const rules = INCREMENT_RULES[mode][type];
  const wholeValue = Math.round(value);
  
  for (const rule of rules) {
    const [min, max] = rule.range;
    if (wholeValue >= min && wholeValue <= max) {
      const remainder = wholeValue % rule.increment;
      if (remainder === 0) {
        return { rounded: wholeValue, wasRounded: false };
      }
      const rounded = wholeValue + (rule.increment - remainder);
      
      if (rounded > max) {
        return { rounded: max, wasRounded: true, increment: rule.increment };
      }
      
      return { rounded, wasRounded: true, increment: rule.increment };
    }
  }
  
  const maxRange = rules[rules.length - 1].range[1];
  if (wholeValue > maxRange) {
    return { 
      rounded: maxRange, 
      wasRounded: true, 
      outOfRange: true,
      message: `Calculated volume (${wholeValue.toLocaleString()} mL) exceeds maximum allowed (${maxRange.toLocaleString()} mL)`
    };
  }
  
  const minRange = rules[0].range[0];
  return { 
    rounded: minRange, 
    wasRounded: true, 
    outOfRange: true,
    message: `Calculated volume (${wholeValue.toLocaleString()} mL) is below minimum allowed (${minRange.toLocaleString()} mL)`
  };
};

const applyRoundingToTotalVolume = (
  calculatedTotal: number,
  fillMode: FillMode
): TotalVolumeResult => {
  const roundingResult = roundToValidIncrement(calculatedTotal, 'totalVolume', fillMode);
  
  return {
    calculated: Math.round(calculatedTotal),
    programmable: roundingResult.rounded,
    difference: roundingResult.rounded - Math.round(calculatedTotal),
    needsRounding: roundingResult.wasRounded,
    increment: roundingResult.increment,
    outOfRange: roundingResult.outOfRange,
    errorMessage: roundingResult.message
  };
};

const useValidation = (mode: FillMode) => {
  const rules = useMemo(() => INCREMENT_RULES[mode], [mode]);
  
  const validateValue = useCallback((
    value: string | number,
    type: 'fillVolume' | 'totalVolume'
  ): ValidationResult => {
    const num = parseInt(value.toString());
    if (isNaN(num)) return { valid: false, message: VALIDATION_MESSAGES.invalidNumber };

    const typeRules = rules[type];
    
    for (const rule of typeRules) {
      const [min, max] = rule.range;
      if (num >= min && num <= max) {
        return num % rule.increment === 0
          ? { valid: true }
          : { valid: false, message: `Must be in increments of ${rule.increment} mL for range ${min}-${max} mL` };
      }
    }

    const minRange = typeRules[0].range[0];
    const maxRange = typeRules[typeRules.length - 1].range[1];
    return { valid: false, message: `Value must be between ${minRange} and ${maxRange} mL` };
  }, [rules]);

  const validateInputs = useCallback((
    total: number,
    fill: number,
    last: number
  ): string | null => {
    if (fill === 0) return VALIDATION_MESSAGES.fillTooSmall;
    
    const totalValidation = validateValue(total, 'totalVolume');
    if (!totalValidation.valid) return `Total Volume: ${totalValidation.message}`;

    const fillValidation = validateValue(fill, 'fillVolume');
    if (!fillValidation.valid) return `Fill Volume: ${fillValidation.message}`;

    const lastFillValidation = validateValue(last, 'fillVolume');
    if (!lastFillValidation.valid) return `Last Fill: ${lastFillValidation.message}`;

    if (last > fill) return VALIDATION_MESSAGES.fillTooLarge;
    if (fill <= 0) return VALIDATION_MESSAGES.fillTooSmall;
    
    return null;
  }, [validateValue]);

  return { validateInputs, validateValue };
};

// ============================================================================
// SECTION 5: UI COMPONENTS
// ============================================================================

const InputField: React.FC<InputFieldProps> = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  focusColor, 
  onKeyPress 
}) => {
  const sanitizeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes('e') || val.includes('E')) {
      e.preventDefault();
      return;
    }
    onChange(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (value) {
      const formatted = parseFloat(value.replace(/,/g, ''));
      if (!isNaN(formatted)) {
        e.target.value = formatted.toString();
      }
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={sanitizeInput}
        onKeyPress={onKeyPress}
        onBlur={handleBlur}
        className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:${focusColor} focus:outline-none text-base sm:text-lg`}
        placeholder={placeholder}
      />
    </div>
  );
};

const ResultDisplay: React.FC<ResultDisplayProps> = ({ 
  title, 
  value, 
  bgColor, 
  borderColor, 
  textColor, 
  children 
}) => (
  <div className={`mt-6 p-5 sm:p-6 ${bgColor} rounded-lg border-2 ${borderColor}`}>
    <div className="text-center">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className={`text-4xl sm:text-5xl font-bold ${textColor}`}>{value}</p>
    </div>
    {children}
  </div>
);

const IncrementInfo: React.FC<IncrementInfoProps> = ({ mode }) => {
  const incrementInfo = useMemo(() => 
    mode === 'low' 
      ? ['60-100 mL: 1 mL increments', '100-500 mL: 10 mL increments', '500-1000 mL: 50 mL increments']
      : ['100-500 mL: 10 mL increments', '500-1000 mL: 50 mL increments', '1000-3000 mL: 100 mL increments'],
    [mode]
  );

  return (
    <div className="mt-5 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
      <h3 className="text-xs font-semibold text-gray-700 mb-2">
        {mode === 'low' ? 'Low Fill' : 'Standard Fill'} Increments:
      </h3>
      <div className="text-xs text-gray-600 space-y-1">
        <p className="font-medium">Fill Volume & Last Fill:</p>
        {incrementInfo.map((info, i) => <p key={i}>• {info}</p>)}
      </div>
    </div>
  );
};

const TimeCalculationsDisplay: React.FC<TimeCalculationsDisplayProps> = ({ 
  timeBreakdown, 
  treatmentTime 
}) => {
  if (!timeBreakdown) return null;
  
  if (timeBreakdown.error) {
    return (
      <div className="mt-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded">
        <p className="text-amber-800 text-sm">{timeBreakdown.error}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-5 sm:p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
      <div className="mb-3">
        <p className="text-sm font-semibold text-blue-900 mb-1">⏱️ Time Calculations (Approximate)</p>
        <p className="text-xs text-blue-700 italic">Based on {FILL_DRAIN_TIME_MINUTES} min fill/drain time per cycle</p>
      </div>
      <div className="space-y-2 text-sm text-gray-700">
        <div className="bg-white p-3 rounded border border-blue-100">
          <p className="font-medium text-blue-800">Time Per Cycle:</p>
          <p className="text-xs mt-1">{timeBreakdown.timePerCycleHours.toFixed(2)} hours ({timeBreakdown.timePerCycleMinutes.toFixed(0)} minutes)</p>
        </div>
        <div className="bg-white p-3 rounded border border-blue-100">
          <p className="font-medium text-blue-800">Dwell Time Per Cycle:</p>
          <p className="text-xs mt-1">{timeBreakdown.dwellTimeHours.toFixed(2)} hours ({timeBreakdown.dwellTimeMinutes.toFixed(0)} minutes)</p>
        </div>
        <div className="bg-white p-3 rounded border border-blue-100">
          <p className="font-medium text-blue-800">Fill Time:</p>
          <p className="text-xs mt-1">{timeBreakdown.fillTimeMinutes.toFixed(1)} minutes per cycle</p>
        </div>
        <div className="bg-white p-3 rounded border border-blue-100">
          <p className="font-medium text-blue-800">Drain Time:</p>
          <p className="text-xs mt-1">{timeBreakdown.drainTimeMinutes.toFixed(1)} minutes per cycle</p>
        </div>
        <div className="bg-blue-100 p-3 rounded border border-blue-200">
          <p className="font-medium text-blue-900">Total Treatment Duration:</p>
          <p className="text-xs mt-1">{treatmentTime} hours ({timeBreakdown.totalTreatmentMinutes} minutes)</p>
          <p className="text-xs mt-1">• Total Dwell Time: {timeBreakdown.totalDwellTimeHours.toFixed(2)} hours</p>
          <p className="text-xs">• Total Fill/Drain Time: {timeBreakdown.totalFillDrainTimeMinutes} minutes</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 6: MAIN APPLICATION COMPONENT
// ============================================================================

// ============================================================================
// SECTION 6: MAIN APPLICATION COMPONENT
// ============================================================================

const PDCalculator: React.FC = () => {
  const [fillMode, setFillMode] = useState<FillMode>('low');
  const [pdMode, setPdMode] = useState<PDMode>('cycles');
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('solveCycles');
  
  const [totalVolume, setTotalVolume] = useState<string>('');
  const [requestedCycles, setRequestedCycles] = useState<string>('');
  const [lastFill, setLastFill] = useState<string>('');
  const [fillVolume, setFillVolume] = useState<string>('');
  const [tidalPercentage, setTidalPercentage] = useState<string>('');
  const [fullDrainEvery, setFullDrainEvery] = useState<string>('');
  const [treatmentTime, setTreatmentTime] = useState<string>('');
  
  const [calculatedCycles, setCalculatedCycles] = useState<number | null>(null);
  const [calculatedTotalVolume, setCalculatedTotalVolume] = useState<TotalVolumeResult | null>(null);
  const [tidalCycles, setTidalCycles] = useState<TidalCyclesResult | null>(null);
  
  const [error, setError] = useState<string>('');
  const [showTimeCalcs, setShowTimeCalcs] = useState<boolean>(false);

  const { validateInputs, validateValue } = useValidation(fillMode);

  const parseNumericInput = (value: string): number => {
    const cleaned = value.replace(/,/g, '');
    return parseFloat(cleaned);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (pdMode === 'cycles') {
        handleCalculateCycles();
      } else {
        handleCalculateTidalCycles();
      }
    }
    if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab' && e.key !== 'Enter') {
      e.preventDefault();
    }
  };

  const handleTotalVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTotalVolume(e.target.value);
    setCalculatedCycles(null);
    setError('');
  }, []);

  const handleRequestedCyclesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRequestedCycles(e.target.value);
    setCalculatedTotalVolume(null);
    setError('');
  }, []);

  const handleCalculateTotalFromCycles = useCallback(() => {
    setError('');
    setCalculatedTotalVolume(null);

    if (!requestedCycles || !fillVolume || !lastFill) {
      setError(VALIDATION_MESSAGES.allFieldsRequired);
      return;
    }

    const cycles = parseInt(requestedCycles);
    const fill = parseNumericInput(fillVolume);
    const last = parseNumericInput(lastFill);

    if (isNaN(cycles) || isNaN(fill) || isNaN(last)) {
      setError(VALIDATION_MESSAGES.invalidNumber);
      return;
    }

    if (cycles <= 0) {
      setError('Number of cycles must be greater than 0');
      return;
    }
    if (!Number.isInteger(cycles)) {
      setError('Number of cycles must be a whole number');
      return;
    }
    if (cycles > 100) {
      setError('Number of cycles seems too high (max 100)');
      return;
    }

    const fillValidation = validateValue(fill, 'fillVolume');
    if (!fillValidation.valid) {
      setError(`Fill Volume: ${fillValidation.message}`);
      return;
    }

    const lastValidation = validateValue(last, 'fillVolume');
    if (!lastValidation.valid) {
      setError(`Last Fill: ${lastValidation.message}`);
      return;
    }

    if (last > fill) {
      setError(VALIDATION_MESSAGES.fillTooLarge);
      return;
    }

    const total = calculateVolumeFromCycles(cycles, fill, last);
    const roundingInfo = applyRoundingToTotalVolume(total, fillMode);
    
    if (roundingInfo.outOfRange) {
      setError(roundingInfo.errorMessage || '');
    }
    
    setCalculatedTotalVolume({
      ...roundingInfo,
      cycles: cycles
    });
  }, [requestedCycles, fillVolume, lastFill, validateValue, fillMode]);

  const handleCalculateCycles = useCallback(() => {
    setError('');
    setCalculatedCycles(null);
    setCalculatedTotalVolume(null);

    if (calculationMode === 'solveTotalVolume') {
      handleCalculateTotalFromCycles();
      return;
    }

    if (!totalVolume || !lastFill || !fillVolume) {
      setError(VALIDATION_MESSAGES.allFieldsRequired);
      return;
    }

    const total = parseNumericInput(totalVolume);
    const last = parseNumericInput(lastFill);
    const fill = parseNumericInput(fillVolume);

    if (isNaN(total) || isNaN(last) || isNaN(fill)) {
      setError(VALIDATION_MESSAGES.invalidNumber);
      return;
    }

    const validationError = validateInputs(total, fill, last);
    if (validationError) {
      setError(validationError);
      return;
    }

    const result = calculateCyclesFromVolume(total, last, fill);
    setCalculatedCycles(result);
  }, [totalVolume, lastFill, fillVolume, validateInputs, calculationMode, handleCalculateTotalFromCycles]);

  const handleCalculateTotalFromTidalCycles = useCallback(() => {
    setError('');
    setCalculatedTotalVolume(null);

    if (!requestedCycles || !fillVolume || !tidalPercentage || !fullDrainEvery || !lastFill) {
      setError(VALIDATION_MESSAGES.allFieldsRequired);
      return;
    }

    const cycles = parseInt(requestedCycles);
    const fill = parseNumericInput(fillVolume);
    const tidal = parseFloat(tidalPercentage);
    const fullDrain = parseInt(fullDrainEvery);
    const last = parseNumericInput(lastFill);

    if (isNaN(cycles) || isNaN(fill) || isNaN(tidal) || isNaN(fullDrain) || isNaN(last)) {
      setError(VALIDATION_MESSAGES.invalidNumber);
      return;
    }

    if (cycles <= 0) {
      setError('Number of cycles must be greater than 0');
      return;
    }
    if (!Number.isInteger(cycles)) {
      setError('Number of cycles must be a whole number');
      return;
    }
    if (cycles > 1000) {
      setError('Number of cycles seems too high (max 1000)');
      return;
    }

    const fillValidation = validateValue(fill, 'fillVolume');
    if (!fillValidation.valid) {
      setError(`Fill Volume: ${fillValidation.message}`);
      return;
    }

    const lastValidation = validateValue(last, 'fillVolume');
    if (!lastValidation.valid) {
      setError(`Last Fill: ${lastValidation.message}`);
      return;
    }

    if (last > fill) {
      setError(VALIDATION_MESSAGES.fillTooLarge);
      return;
    }

    if (tidal < 40 || tidal > 95) {
      setError(VALIDATION_MESSAGES.tidalRange);
      return;
    }
    if (tidal % 5 !== 0) {
      setError(VALIDATION_MESSAGES.tidalIncrement);
      return;
    }

    if (fullDrain < 1 || fullDrain > 10) {
      setError(VALIDATION_MESSAGES.fullDrainRange);
      return;
    }
    if (!Number.isInteger(fullDrain)) {
      setError(VALIDATION_MESSAGES.fullDrainInteger);
      return;
    }

    const tidalDecimal = tidal / 100;
    const total = calculateVolumeFromTidalCycles(cycles, fill, last, tidalDecimal, fullDrain);
    
    const roundingInfo = applyRoundingToTotalVolume(total, fillMode);
    
    if (roundingInfo.outOfRange) {
      setError(roundingInfo.errorMessage || '');
    }
    
    const fullDrainCount = Math.ceil(cycles / fullDrain);
    const tidalDrainCycles = cycles - fullDrainCount;
    const tidalVolume = fill * tidalDecimal * tidalDrainCycles;
    const fullDrainVolume = fullDrainCount * fill;

    setCalculatedTotalVolume({
      ...roundingInfo,
      cycles: cycles,
      tidalVolume: Math.round(tidalVolume),
      fullDrainVolume: Math.round(fullDrainVolume),
      lastFill: last,
      fullDrainCount,
      tidalDrainCycles
    });
  }, [requestedCycles, fillVolume, tidalPercentage, fullDrainEvery, lastFill, validateValue, fillMode]);

  const handleCalculateTidalCycles = useCallback(() => {
    setError('');
    setTidalCycles(null);
    setCalculatedTotalVolume(null);

    if (calculationMode === 'solveTotalVolume') {
      handleCalculateTotalFromTidalCycles();
      return;
    }

    if (!totalVolume || !fillVolume || !tidalPercentage || !fullDrainEvery || !lastFill) {
      setError(VALIDATION_MESSAGES.allFieldsRequired);
      return;
    }

    const total = parseNumericInput(totalVolume);
    const fill = parseNumericInput(fillVolume);
    const tidal = parseFloat(tidalPercentage);
    const fullDrain = parseInt(fullDrainEvery);
    const last = parseNumericInput(lastFill);

    if (isNaN(total) || isNaN(fill) || isNaN(tidal) || isNaN(fullDrain) || isNaN(last)) {
      setError(VALIDATION_MESSAGES.invalidNumber);
      return;
    }

    const validationError = validateInputs(total, fill, last);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (tidal < 40 || tidal > 95) {
      setError(VALIDATION_MESSAGES.tidalRange);
      return;
    }
    if (tidal % 5 !== 0) {
      setError(VALIDATION_MESSAGES.tidalIncrement);
      return;
    }

    if (fullDrain < 1 || fullDrain > 10) {
      setError(VALIDATION_MESSAGES.fullDrainRange);
      return;
    }
    if (!Number.isInteger(fullDrain)) {
      setError(VALIDATION_MESSAGES.fullDrainInteger);
      return;
    }

    const workingVolume = total - last;
    const tidalDecimal = tidal / 100;
    
    const bestCycles = calculateTidalCyclesCount(workingVolume, fill, tidalDecimal, fullDrain);
    
    const fullDrainCount = Math.ceil(bestCycles / fullDrain);
    const tidalDrainCycles = bestCycles - fullDrainCount;
    const tidalVolume = fill * tidalDecimal * tidalDrainCycles;
    const fullDrainVolume = fullDrainCount * fill;
    const calculatedTotal = tidalVolume + fullDrainVolume + last;

    setTidalCycles({
      cycles: bestCycles,
      calculatedTotal: Math.round(calculatedTotal),
      requestedTotal: total,
      difference: Math.round(calculatedTotal - total),
      tidalVolume: Math.round(tidalVolume),
      fullDrainVolume: Math.round(fullDrainVolume),
      fullDrainCount,
      tidalDrainCycles
    });
  }, [totalVolume, fillVolume, tidalPercentage, fullDrainEvery, lastFill, validateInputs, calculationMode, handleCalculateTotalFromTidalCycles]);

  const resetFields = useCallback(() => {
    setTotalVolume('');
    setFillVolume('');
    setLastFill('');
    setCalculatedCycles(null);
    setCalculatedTotalVolume(null);
    setRequestedCycles('');
    setTidalCycles(null);
    setTidalPercentage('');
    setFullDrainEvery('');
    setTreatmentTime('');
    setError('');
  }, []);

  const handleFillModeChange = useCallback((newMode: FillMode) => {
    setFillMode(newMode);
    resetFields();
  }, [resetFields]);

  const handlePdModeChange = useCallback((newType: PDMode) => {
    setPdMode(newType);
    resetFields();
  }, [resetFields]);

  const focusColor = pdMode === 'cycles' ? 'border-teal-500' : 'border-cyan-400';
  const buttonColor = pdMode === 'cycles' 
    ? 'bg-teal-600 hover:bg-teal-700' 
    : 'bg-cyan-500 hover:bg-cyan-600';
  
  const timeBreakdown = useMemo(() => {
    if (!showTimeCalcs || !treatmentTime) return null;
    
    let cycleCount: number | undefined;
    if (pdMode === 'cycles') {
      cycleCount = calculatedCycles ?? parseInt(requestedCycles);
    } else {
      cycleCount = tidalCycles?.cycles ?? parseInt(requestedCycles);
    }
    
    if (!cycleCount || isNaN(cycleCount)) return null;
    return calculateTimeBreakdown(parseFloat(treatmentTime), cycleCount);
  }, [showTimeCalcs, treatmentTime, calculatedCycles, requestedCycles, tidalCycles, pdMode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center flex-col">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Calculator className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600 flex-shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">PD Machine Calculator</h1>
        </div>

        <div className="mb-5 sm:mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Fill Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleFillModeChange('low')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                fillMode === 'low' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Low Fill
            </button>
            <button
              onClick={() => handleFillModeChange('standard')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                fillMode === 'standard' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Standard Fill
            </button>
          </div>
        </div>

        <div className="mb-5 sm:mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">PD Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => handlePdModeChange('cycles')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                pdMode === 'cycles' ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Regular PD
            </button>
            <button
              onClick={() => handlePdModeChange('tidal')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                pdMode === 'tidal' ? 'bg-cyan-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Tidal PD
            </button>
          </div>
        </div>

        <div className="mb-5 sm:mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Solve For</label>
          <div className="flex gap-2">
            <button
              onClick={() => setCalculationMode('solveCycles')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                calculationMode === 'solveCycles' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              # of Cycles
            </button>
            <button
              onClick={() => setCalculationMode('solveTotalVolume')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                calculationMode === 'solveTotalVolume' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Total Volume
            </button>
          </div>
        </div>

        <div className="mb-5 sm:mb-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showTimeCalcs}
              onChange={(e) => setShowTimeCalcs(e.target.checked)}
              className="w-4 h-4 text-teal-600 rounded"
            />
            <span className="font-medium">Include time calculations</span>
          </label>
        </div>

        {pdMode === 'cycles' ? (
          <div className="space-y-4">
            <InputField
              label={calculationMode === 'solveCycles' ? 'Total Volume (mL)' : 'Number of Cycles'}
              value={calculationMode === 'solveCycles' ? totalVolume : requestedCycles}
              onChange={calculationMode === 'solveCycles' ? handleTotalVolumeChange : handleRequestedCyclesChange}
              placeholder={
                calculationMode === 'solveCycles' 
                  ? (fillMode === 'low' ? 'e.g., 3000' : 'e.g., 10000')
                  : 'e.g., 10'
              }
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />
            
            <InputField
              label="Fill Volume (mL)"
              value={fillVolume}
              onChange={(e) => setFillVolume(e.target.value)}
              placeholder={fillMode === 'low' ? 'e.g., 240' : 'e.g., 1400'}
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />
            
            <InputField
              label="Last Fill (mL)"
              value={lastFill}
              onChange={(e) => setLastFill(e.target.value)}
              placeholder={fillMode === 'low' ? 'e.g., 120' : 'e.g., 700'}
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />

            {showTimeCalcs && (
              <InputField
                label="Treatment Time (hours)"
                value={treatmentTime}
                onChange={(e) => setTreatmentTime(e.target.value)}
                placeholder="e.g., 8"
                focusColor={focusColor}
                onKeyPress={handleKeyPress}
              />
            )}

            <button
              onClick={handleCalculateCycles}
              className={`w-full ${buttonColor} text-white font-semibold py-2.5 sm:py-3 px-6 rounded-lg transition-colors duration-200 mt-6 text-base sm:text-lg`}
            >
              Calculate
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <InputField
              label={calculationMode === 'solveCycles' ? 'Total Volume (mL)' : 'Number of Cycles'}
              value={calculationMode === 'solveCycles' ? totalVolume : requestedCycles}
              onChange={calculationMode === 'solveCycles' ? handleTotalVolumeChange : handleRequestedCyclesChange}
              placeholder={
                calculationMode === 'solveCycles' 
                  ? (fillMode === 'low' ? 'e.g., 3000' : 'e.g., 10000')
                  : 'e.g., 10'
              }
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />
            
            <InputField
              label="Fill Volume (mL)"
              value={fillVolume}
              onChange={(e) => setFillVolume(e.target.value)}
              placeholder={fillMode === 'low' ? 'e.g., 240' : 'e.g., 1400'}
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />
            
            <InputField
              label="Last Fill (mL)"
              value={lastFill}
              onChange={(e) => setLastFill(e.target.value)}
              placeholder={fillMode === 'low' ? 'e.g., 120' : 'e.g., 700'}
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />
            
            <InputField
              label="Tidal Percentage (%)"
              value={tidalPercentage}
              onChange={(e) => setTidalPercentage(e.target.value)}
              placeholder="e.g., 85 (40-95%, increments of 5%)"
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />
            
            <InputField
              label="Full Drain Every N Cycles"
              value={fullDrainEvery}
              onChange={(e) => setFullDrainEvery(e.target.value)}
              placeholder="e.g., 3 (1-10 cycles)"
              focusColor={focusColor}
              onKeyPress={handleKeyPress}
            />

            {showTimeCalcs && (
              <InputField
                label="Treatment Time (hours)"
                value={treatmentTime}
                onChange={(e) => setTreatmentTime(e.target.value)}
                placeholder="e.g., 8"
                focusColor={focusColor}
                onKeyPress={handleKeyPress}
              />
            )}

            <button
              onClick={handleCalculateTidalCycles}
              className={`w-full ${buttonColor} text-white font-semibold py-2.5 sm:py-3 px-6 rounded-lg transition-colors duration-200 mt-6 text-base sm:text-lg`}
            >
              Calculate
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 sm:p-4 bg-red-50 border-l-4 border-red-500 rounded mt-4">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {calculatedCycles !== null && (
          <ResultDisplay
            title="Number of Cycles"
            value={calculatedCycles}
            bgColor="bg-teal-50"
            borderColor="border-teal-200"
            textColor="text-teal-600"
          >
            <div className="mt-4 pt-4 border-t border-teal-200 text-sm text-gray-600 space-y-1">
              <p>Fill Mode: {fillMode === 'low' ? 'Low Fill' : 'Standard Fill'}</p>
              <p>Working Volume: {(parseNumericInput(totalVolume) - parseNumericInput(lastFill)).toLocaleString()} mL</p>
              <p>Calculation: ({parseNumericInput(totalVolume).toLocaleString()} - {parseNumericInput(lastFill).toLocaleString()}) ÷ {parseNumericInput(fillVolume).toLocaleString()} = {calculatedCycles}</p>
            </div>
          </ResultDisplay>
        )}

        {calculatedCycles !== null && showTimeCalcs && (
          <TimeCalculationsDisplay timeBreakdown={timeBreakdown} treatmentTime={treatmentTime} />
        )}

        {calculatedTotalVolume !== null && !calculatedTotalVolume.tidalVolume && (
          <ResultDisplay
            title="Programmable Total Volume"
            value={`${calculatedTotalVolume.programmable.toLocaleString()} mL`}
            bgColor="bg-blue-50"
            borderColor="border-blue-200"
            textColor="text-blue-600"
          >
            <div className="mt-4 pt-4 border-t border-blue-200 text-sm text-gray-600 space-y-1">
              {calculatedTotalVolume.needsRounding && (
                <div className="mb-3 p-3 bg-blue-100 rounded border border-blue-300">
                  <p className="font-medium text-blue-900 text-sm">Volume Adjustment Applied</p>
                  <p className="text-xs mt-1 text-blue-800">
                    Calculated: {calculatedTotalVolume.calculated.toLocaleString()} mL → Programmable: {calculatedTotalVolume.programmable.toLocaleString()} mL
                  </p>
                  <p className="text-xs text-blue-700">
                    Adjusted +{calculatedTotalVolume.difference.toLocaleString()} mL to match {calculatedTotalVolume.increment} mL increment requirement
                  </p>
                </div>
              )}
              
              {!calculatedTotalVolume.needsRounding && (
                <div className="mb-3 p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-700 font-medium">
                    ✓ No adjustment needed - Exact match
                  </p>
                </div>
              )}
              
              <p className="font-medium text-gray-700 pt-2">Calculation Details:</p>
              <p>Fill Mode: {fillMode === 'low' ? 'Low Fill' : 'Standard Fill'}</p>
              <p>Requested Cycles: {calculatedTotalVolume.cycles}</p>
              <p>Working Volume: ({calculatedTotalVolume.cycles} × {parseNumericInput(fillVolume).toLocaleString()}) = {((calculatedTotalVolume.cycles || 0) * parseNumericInput(fillVolume)).toLocaleString()} mL</p>
              <p>Last Fill: {parseNumericInput(lastFill).toLocaleString()} mL</p>
              <p>Calculated Total: {calculatedTotalVolume.calculated.toLocaleString()} mL</p>
            </div>
          </ResultDisplay>
        )}

        {calculatedTotalVolume !== null && !calculatedTotalVolume.tidalVolume && showTimeCalcs && (
          <TimeCalculationsDisplay timeBreakdown={timeBreakdown} treatmentTime={treatmentTime} />
        )}

        {tidalCycles && (
          <ResultDisplay
            title="Number of Tidal Cycles"
            value={tidalCycles.cycles}
            bgColor="bg-cyan-50"
            borderColor="border-cyan-200"
            textColor="text-cyan-600"
          >
            <div className="mt-4 pt-4 border-t border-cyan-200 text-sm text-gray-600 space-y-1">
              <p>Fill Mode: {fillMode === 'low' ? 'Low Fill' : 'Standard Fill'}</p>
              <p>Requested total: {tidalCycles.requestedTotal.toLocaleString()} mL</p>
              <p>Calculated total: {tidalCycles.calculatedTotal.toLocaleString()} mL</p>
              <p className={tidalCycles.difference === 0 ? 'text-green-600 font-semibold' : 'text-gray-600'}>
                Difference: {tidalCycles.difference.toLocaleString()} mL
                {tidalCycles.difference === 0 && ' ✓ Exact match!'}
              </p>
              <div className="pt-3 mt-3 border-t border-cyan-200 space-y-2">
                <p className="font-medium text-gray-700">Calculation Breakdown:</p>
                <div className="bg-white p-3 rounded border border-cyan-100">
                  <p className="font-medium text-cyan-700">Tidal Volume:</p>
                  <p className="text-xs mt-1">({parseNumericInput(fillVolume).toLocaleString()} × {tidalPercentage}%) × {tidalCycles.tidalDrainCycles} = {tidalCycles.tidalVolume.toLocaleString()} mL</p>
                </div>
                <div className="bg-white p-3 rounded border border-cyan-100">
                  <p className="font-medium text-cyan-700">Full Fill Volume:</p>
                  <p className="text-xs mt-1">{parseNumericInput(fillVolume).toLocaleString()} × {tidalCycles.fullDrainCount} = {tidalCycles.fullDrainVolume.toLocaleString()} mL</p>
                </div>
                <div className="bg-white p-3 rounded border border-cyan-100">
                  <p className="font-medium text-cyan-700">Last Fill:</p>
                  <p className="text-xs mt-1">{parseNumericInput(lastFill).toLocaleString()} mL</p>
                </div>
                <div className="bg-cyan-100 p-3 rounded border border-cyan-200 font-medium">
                  <p className="text-cyan-900">Total = {tidalCycles.tidalVolume.toLocaleString()} + {tidalCycles.fullDrainVolume.toLocaleString()} + {parseNumericInput(lastFill).toLocaleString()} = {tidalCycles.calculatedTotal.toLocaleString()} mL</p>
                </div>
              </div>
            </div>
          </ResultDisplay>
        )}
        {tidalCycles && showTimeCalcs && (
          <TimeCalculationsDisplay timeBreakdown={timeBreakdown} treatmentTime={treatmentTime} />
        )}

        {calculatedTotalVolume !== null && calculatedTotalVolume.tidalVolume && (
          <ResultDisplay
            title="Programmable Total Volume (Tidal PD)"
            value={`${calculatedTotalVolume.programmable.toLocaleString()} mL`}
            bgColor="bg-blue-50"
            borderColor="border-blue-200"
            textColor="text-blue-600"
          >
            <div className="mt-4 pt-4 border-t border-blue-200 text-sm text-gray-600 space-y-1">
              {calculatedTotalVolume.needsRounding && (
                <div className="mb-3 p-3 bg-blue-100 rounded border border-blue-300">
                  <p className="font-medium text-blue-900 text-sm">Volume Adjustment Applied</p>
                  <p className="text-xs mt-1 text-blue-800">
                    Calculated: {calculatedTotalVolume.calculated.toLocaleString()} mL → Programmable: {calculatedTotalVolume.programmable.toLocaleString()} mL
                  </p>
                  <p className="text-xs text-blue-700">
                    Adjusted +{calculatedTotalVolume.difference.toLocaleString()} mL to match {calculatedTotalVolume.increment} mL increment requirement
                  </p>
                </div>
              )}
              
              {!calculatedTotalVolume.needsRounding && (
                <div className="mb-3 p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-700 font-medium">
                    ✓ No adjustment needed - Exact match
                  </p>
                </div>
              )}
              
              <p className="font-medium text-gray-700 pt-2">Calculation Details:</p>
              <p>Fill Mode: {fillMode === 'low' ? 'Low Fill' : 'Standard Fill'}</p>
              <p>Requested Cycles: {calculatedTotalVolume.cycles}</p>
              
              <div className="pt-3 mt-3 border-t border-blue-200 space-y-2">
                <p className="font-medium text-gray-700">Breakdown:</p>
                <div className="bg-white p-3 rounded border border-blue-100">
                  <p className="font-medium text-blue-700">Tidal Volume:</p>
                  <p className="text-xs mt-1">({parseNumericInput(fillVolume).toLocaleString()} × {tidalPercentage}%) × {calculatedTotalVolume.tidalDrainCycles} = {calculatedTotalVolume.tidalVolume.toLocaleString()} mL</p>
                </div>
                <div className="bg-white p-3 rounded border border-blue-100">
                  <p className="font-medium text-blue-700">Full Fill Volume:</p>
                  <p className="text-xs mt-1">{parseNumericInput(fillVolume).toLocaleString()} × {calculatedTotalVolume.fullDrainCount} = {calculatedTotalVolume.fullDrainVolume?.toLocaleString()} mL</p>
                </div>
                <div className="bg-white p-3 rounded border border-blue-100">
                  <p className="font-medium text-blue-700">Last Fill:</p>
                  <p className="text-xs mt-1">{parseNumericInput(lastFill).toLocaleString()} mL</p>
                </div>
                <div className="bg-blue-100 p-3 rounded border border-blue-200 font-medium">
                  <p className="text-blue-900">Calculated Total = {calculatedTotalVolume.tidalVolume.toLocaleString()} + {calculatedTotalVolume.fullDrainVolume?.toLocaleString()} + {parseNumericInput(lastFill).toLocaleString()} = {calculatedTotalVolume.calculated.toLocaleString()} mL</p>
                </div>
              </div>
            </div>
          </ResultDisplay>
        )}

        {calculatedTotalVolume !== null && calculatedTotalVolume.tidalVolume && showTimeCalcs && (
          <TimeCalculationsDisplay timeBreakdown={timeBreakdown} treatmentTime={treatmentTime} />
        )}

        <IncrementInfo mode={fillMode} />
      </div>

      <footer className="mt-6 text-center text-sm text-gray-600">
        Developed by <a href="https://hyperceptive.org/" class="text-blue-800 hover:text-blue-950" target="hyperceptive">Hyperceptive</a>, Beep Bop Boop. © {new Date().getFullYear()} All rights reserved.
      </footer>

    </div>
  );
};

export default PDCalculator;
