'use client';

/**
 * Quarter + year dropdowns for "which tax period" choices (moving a filing,
 * re-assigning a deposit). Offers four years back through next year, plus
 * the current value if it falls outside that range.
 */
export default function QuarterPicker({
  year,
  quarter,
  onChange,
}: {
  year: number;
  quarter: number;
  onChange: (next: { year: number; quarter: number }) => void;
}) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 4 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);

  const select = 'mt-1 rounded-md border border-gray-300 px-3 py-2';
  return (
    <div className="flex gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Quarter</label>
        <select value={quarter} onChange={(e) => onChange({ year, quarter: parseInt(e.target.value) })} className={select}>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              Q{q}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Year</label>
        <select value={year} onChange={(e) => onChange({ year: parseInt(e.target.value), quarter })} className={select}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
