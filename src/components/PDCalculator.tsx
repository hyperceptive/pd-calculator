import React, { useState } from 'react';
import { Calculator, AlertCircle } from 'lucide-react';

export default function PDCalculator() {
  const [mode, setMode] = useState('low'); // 'low' or 'standard'
  const [totalVolume, setTotalVolume] = useState('');
  const [lastFill, setLastFill] = useState('');
  const [fillVolume, setFillVolume] = useState('');
  const [cycles, setCycles] = useState(null);
  const [error, setError] = useState('');

  const getIncrementRules = () => {
    if (mode === 'low') {
      return {
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
      };
    }
    else {
      return {
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
      };
    }
  };

  const validateValue = (value, type) => {
    const num = parseInt(value);
    if (isNaN(num)) return { valid: false, message: 'Please enter a valid number' };

    const rules = getIncrementRules()[type];

    for (const rule of rules) {
      if (num >= rule.range[0] && num <= rule.range[1]) {
        if (num % rule.increment === 0) {
          return { valid: true };
        } else {
          return { 
            valid: false, 
            message: `Must be in increments of ${rule.increment} mL for range ${rule.range[0]}-${rule.range[1]} mL` 
          };
        }
      }
    }

    const minRange = rules[0].range[0];
    const maxRange = rules[rules.length - 1].range[1];

    return { 
      valid: false, 
      message: `Value must be between ${minRange} and ${maxRange} mL` 
    };
  };

  const calculateCycles = () => {
    setError('');
    setCycles(null);

    const total = parseInt(totalVolume);
    const last = parseInt(lastFill);
    const fill = parseInt(fillVolume);

    // Validation
    if (!totalVolume || !lastFill || !fillVolume) {
      setError('Please fill in all fields');
      return;
    }

    const totalValidation = validateValue(total, 'totalVolume');
    if (!totalValidation.valid) {
      setError(`Total Volume: ${totalValidation.message}`);
      return;
    }

    const fillValidation = validateValue(fill, 'fillVolume');
    if (!fillValidation.valid) {
      setError(`Fill Volume: ${fillValidation.message}`);
      return;
    }

    if (last >= total) {
      setError('Last fill must be less than total volume');
      return;
    }

    if (fill <= 0) {
      setError('Fill volume must be greater than 0');
      return;
    }

    // Calculate cycles (round down)
    const workingVolume = total - last;
    const calculatedCycles = Math.floor(workingVolume / fill);

    setCycles(calculatedCycles);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setTotalVolume('');
    setFillVolume('');
    setLastFill('');
    setCycles(null);
    setError('');
  };

  return (
<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
  <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
    <div className="flex items-center gap-3 mb-6">
      <Calculator className="w-8 h-8 text-indigo-600" />
      <h1 className="text-2xl font-bold text-gray-800">PD Machine Calculator</h1>
    </div>
    {/* Mode Toggle */}
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">Fill Mode</label>
      <div className="flex gap-2">
        <button
          onClick={() => handleModeChange('low')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            mode === 'low'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Low Fill
        </button>
        <button
          onClick={() => handleModeChange('standard')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            mode === 'standard'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Standard Fill
        </button>
      </div>
    </div>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Total Volume (mL)
        </label>
        <input
          type="number"
          value={totalVolume}
          onChange={(e) => setTotalVolume(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-lg"
          placeholder={mode === 'low' ? 'e.g., 11000' : 'e.g., 10000'}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Last Fill (mL)
        </label>
        <input
          type="number"
          value={lastFill}
          onChange={(e) => setLastFill(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-lg"
          placeholder="e.g., 750"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Fill Volume (mL)
        </label>
        <input
          type="number"
          value={fillVolume}
          onChange={(e) => setFillVolume(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-lg"
          placeholder={mode === 'low' ? 'e.g., 750' : 'e.g., 1400'}
        />
      </div>
      <button
        onClick={calculateCycles}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 mt-6"
      >
        Calculate Cycles
      </button>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border-l-4 border-red-500 rounded">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {cycles !== null && (
        <div className="mt-6 p-6 bg-indigo-50 rounded-lg border-2 border-indigo-200">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Number of Cycles</p>
            <p className="text-5xl font-bold text-indigo-600">{cycles}</p>
          </div>
          
          <div className="mt-4 pt-4 border-t border-indigo-200 text-sm text-gray-600 space-y-1">
            <p>Mode: {mode === 'low' ? 'Low Fill' : 'Standard Fill'}</p>
            <p>Working Volume: {parseInt(totalVolume) - parseInt(lastFill)} mL</p>
            <p>Calculation: ({totalVolume} - {lastFill}) ÷ {fillVolume} = {cycles}</p>
          </div>
        </div>
      )}
    </div>
    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-xs font-semibold text-gray-700 mb-2">
        {mode === 'low' ? 'Low Fill Mode' : 'Standard Fill Mode'} Increments:
      </h3>
      <div className="text-xs text-gray-600 space-y-1">
        <p className="font-medium">Fill Volume:</p>
        {mode === 'low' ? (
          <>
            <p>• 60-100 mL: 1 mL increments</p>
            <p>• 100-500 mL: 10 mL increments</p>
            <p>• 500-1000 mL: 50 mL increments</p>
          </>
        ) : (
          <>
            <p>• 100-500 mL: 10 mL increments</p>
            <p>• 500-1000 mL: 50 mL increments</p>
            <p>• 1000-3000 mL: 100 mL increments</p>
          </>
        )}
      </div>
    </div>
  </div>
</div>
  );
}
