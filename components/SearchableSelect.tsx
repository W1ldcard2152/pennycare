'use client';

import { useEffect, useRef, useState } from 'react';

export interface SearchableSelectOption {
  id: string;
  code: string;
  name: string;
  // Optional per-option disable (e.g., already used in another rule). Disabled
  // options still appear in the list, dimmed, and can't be clicked.
  disabled?: boolean;
  disabledHint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select account...',
  className = '',
  required = false,
  disabled = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 });
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  const filteredOptions = search
    ? options.filter((o) => `${o.code} ${o.name}`.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      setOpenUpward(shouldOpenUpward);

      if (shouldOpenUpward) {
        setDropdownPos({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      } else {
        setDropdownPos({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {required && (
        <input
          type="text"
          required
          value={value}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between border rounded px-2 py-1.5 text-sm bg-white border-gray-300 ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedOption ? `${selectedOption.code} — ${selectedOption.name}` : placeholder}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg flex ${openUpward ? 'flex-col-reverse' : 'flex-col'}`}
          style={{
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 320),
            ...(openUpward ? { bottom: dropdownPos.bottom } : { top: dropdownPos.top }),
          }}
        >
          <div className={`p-2 ${openUpward ? 'border-t' : 'border-b'}`}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full border rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No matches found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  className={`px-3 py-1.5 text-sm ${
                    option.disabled
                      ? 'text-gray-400 cursor-not-allowed bg-gray-50'
                      : option.id === value
                        ? 'bg-blue-100 text-blue-800 cursor-pointer'
                        : 'text-gray-700 hover:bg-blue-50 cursor-pointer'
                  }`}
                >
                  <span className="font-medium">{option.code}</span> &mdash; {option.name}
                  {option.disabled && option.disabledHint && (
                    <span className="text-xs text-gray-400 ml-2">({option.disabledHint})</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
