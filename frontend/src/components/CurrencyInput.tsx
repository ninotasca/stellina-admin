import React, { useState } from 'react';

interface CurrencyInputProps {
  // Value is a raw decimal string (e.g. "1234.5", "" for empty). Decimals round to 2 on display.
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

const formatCurrency = (raw: string): string => {
  if (!raw) return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  const hasFraction = n !== Math.floor(n);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
};

const stripFormatting = (s: string): string => {
  // Keep digits and at most one decimal point.
  const cleaned = s.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
};

const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value, onChange, className, placeholder, disabled,
}) => {
  const [focused, setFocused] = useState(false);
  const display = focused ? value : formatCurrency(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(stripFormatting(e.target.value))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={className}
    />
  );
};

export default CurrencyInput;
