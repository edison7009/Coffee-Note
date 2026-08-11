import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../transcriptionSettings.css';

interface SettingsSelectOption {
  value: string;
  label: string;
}

export function SettingsSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const moveFocus = (direction: 1 | -1) => {
    const focusedIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    const nextIndex = focusedIndex < 0
      ? selectedIndex
      : (focusedIndex + direction + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="transcription-select settings-select" ref={rootRef}>
      <button
        type="button"
        className="transcription-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            window.requestAnimationFrame(() => moveFocus(event.key === 'ArrowDown' ? 1 : -1));
          }
        }}
      >
        <span>{options[selectedIndex]?.label ?? value}</span>
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="transcription-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              type="button"
              className={option.value === value ? 'selected' : ''}
              role="option"
              aria-selected={option.value === value}
              ref={(element) => { optionRefs.current[index] = element; }}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(event.key === 'ArrowDown' ? 1 : -1);
                }
              }}
              key={option.value}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} strokeWidth={2} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
