'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  hourlyRate: number | null;
}

interface TimeEntry {
  id: string;
  employeeId: string;
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  notes: string | null;
}

interface TimePair {
  clockIn: string;
  clockOut: string;
}

export default function TimeTrackingPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Date>(getStartOfWeek(new Date()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees();
    fetchTimeEntries();
  }, [selectedWeek]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      setEmployees(data.filter((e: any) => e.isActive && e.payType === 'hourly'));
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchTimeEntries = async () => {
    try {
      const startDate = formatDate(selectedWeek);
      const endDate = formatDate(getEndOfWeek(selectedWeek));

      const res = await fetch(`/api/time-entries?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      setTimeEntries(data);
    } catch (error) {
      console.error('Error fetching time entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveTimeEntry = async (employeeId: string, date: Date, regularHours: number, overtimeHours: number, notes: string) => {
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          date: formatDate(date),
          hoursWorked: regularHours,
          overtimeHours,
          notes: notes || null,
        }),
      });

      if (res.ok) {
        fetchTimeEntries();
      }
    } catch (error) {
      console.error('Error saving time entry:', error);
    }
  };

  const weekDays = getWeekDays(selectedWeek);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Time Tracking</h1>
        <p className="mt-2 text-gray-600">
          Track employee hours for payroll processing
        </p>
      </div>

      {/* Week Selector */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSelectedWeek(addWeeks(selectedWeek, -1))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Previous Week
          </button>
          <div className="flex items-center space-x-2 text-lg font-semibold">
            <CalendarIcon className="h-5 w-5" />
            <span>
              {formatDate(selectedWeek)} - {formatDate(getEndOfWeek(selectedWeek))}
            </span>
          </div>
          <button
            onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Next Week
          </button>
          <button
            onClick={() => setSelectedWeek(getStartOfWeek(new Date()))}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Current Week
          </button>
        </div>
      </div>

      {/* Time Entry Grid */}
      {loading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Employee
                </th>
                {weekDays.map((day) => (
                  <th key={day.toISOString()} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <div>{formatDayOfWeek(day)}</div>
                    <div className="text-gray-400">{formatDayMonth(day)}</div>
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {employees.map((employee) => (
                <TimeEntryRow
                  key={employee.id}
                  employee={employee}
                  weekDays={weekDays}
                  timeEntries={timeEntries.filter((e) => e.employeeId === employee.id)}
                  onSave={saveTimeEntry}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TimeEntryRow({
  employee,
  weekDays,
  timeEntries,
  onSave,
}: {
  employee: Employee;
  weekDays: Date[];
  timeEntries: TimeEntry[];
  onSave: (employeeId: string, date: Date, regularHours: number, overtimeHours: number, notes: string) => void;
}) {
  const [editingDay, setEditingDay] = useState<string | null>(null);

  const getEntryForDay = (day: Date) => {
    return timeEntries.find((e) => e.date === formatDate(day));
  };

  const totalHours = timeEntries.reduce((sum, e) => sum + e.hoursWorked + e.overtimeHours, 0);

  return (
    <tr>
      <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900">
        <div>{employee.firstName} {employee.lastName}</div>
        <div className="text-xs text-gray-500">{employee.position}</div>
      </td>
      {weekDays.map((day) => {
        const entry = getEntryForDay(day);
        const dayKey = formatDate(day);
        const isEditing = editingDay === dayKey;

        return (
          <td key={dayKey} className="px-6 py-4">
            {isEditing ? (
              <TimeEntryCell
                entry={entry}
                onSave={(regular, overtime, notes) => {
                  onSave(employee.id, day, regular, overtime, notes);
                  setEditingDay(null);
                }}
                onCancel={() => setEditingDay(null)}
              />
            ) : (
              <button
                onClick={() => setEditingDay(dayKey)}
                className="w-full rounded border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                {entry ? (
                  <div>
                    <div className="font-medium">{entry.hoursWorked + entry.overtimeHours}h</div>
                    {entry.overtimeHours > 0 && (
                      <div className="text-xs text-orange-600">OT: {entry.overtimeHours}h</div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400">-</div>
                )}
              </button>
            )}
          </td>
        );
      })}
      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
        {totalHours}h
      </td>
    </tr>
  );
}

function TimeEntryCell({
  entry,
  onSave,
  onCancel,
}: {
  entry: TimeEntry | undefined;
  onSave: (regularHours: number, overtimeHours: number, notes: string) => void;
  onCancel: () => void;
}) {
  // Initialize with one empty time pair
  const [timePairs, setTimePairs] = useState<TimePair[]>([{ clockIn: '', clockOut: '' }]);
  const [notes, setNotes] = useState(entry?.notes || '');
  const [manualOverride, setManualOverride] = useState(false);
  const [manualRegular, setManualRegular] = useState(entry?.hoursWorked || 0);
  const [manualOvertime, setManualOvertime] = useState(entry?.overtimeHours || 0);

  // Calculate hours from time pairs
  const calculateHoursFromPairs = (): { regular: number; overtime: number } => {
    let totalMinutes = 0;

    for (const pair of timePairs) {
      if (pair.clockIn && pair.clockOut) {
        const clockInMinutes = timeToMinutes(pair.clockIn);
        const clockOutMinutes = timeToMinutes(pair.clockOut);

        if (clockOutMinutes > clockInMinutes) {
          totalMinutes += clockOutMinutes - clockInMinutes;
        }
      }
    }

    const totalHours = totalMinutes / 60;
    const regular = Math.min(totalHours, 8);
    const overtime = Math.max(0, totalHours - 8);

    return { regular: Math.round(regular * 100) / 100, overtime: Math.round(overtime * 100) / 100 };
  };

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const { regular: calculatedRegular, overtime: calculatedOvertime } = calculateHoursFromPairs();
  const totalCalculatedHours = calculatedRegular + calculatedOvertime;

  const addTimePair = () => {
    setTimePairs([...timePairs, { clockIn: '', clockOut: '' }]);
  };

  const removeTimePair = (index: number) => {
    if (timePairs.length > 1) {
      setTimePairs(timePairs.filter((_, i) => i !== index));
    }
  };

  const updateTimePair = (index: number, field: 'clockIn' | 'clockOut', value: string) => {
    const updated = [...timePairs];
    updated[index] = { ...updated[index], [field]: value };
    setTimePairs(updated);
  };

  const handleSave = () => {
    if (manualOverride) {
      onSave(manualRegular, manualOvertime, notes);
    } else {
      onSave(calculatedRegular, calculatedOvertime, notes);
    }
  };

  return (
    <div className="space-y-3 rounded border-2 border-blue-500 bg-white p-3 shadow-lg min-w-[220px]">
      {/* Time Pairs */}
      <div className="space-y-2">
        {timePairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-1">
            <div className="flex-1">
              <input
                type="time"
                value={pair.clockIn}
                onChange={(e) => updateTimePair(index, 'clockIn', e.target.value)}
                className="w-full rounded border px-1 py-1 text-xs"
                placeholder="In"
                autoFocus={index === 0}
              />
            </div>
            <span className="text-gray-400 text-xs">-</span>
            <div className="flex-1">
              <input
                type="time"
                value={pair.clockOut}
                onChange={(e) => updateTimePair(index, 'clockOut', e.target.value)}
                className="w-full rounded border px-1 py-1 text-xs"
                placeholder="Out"
              />
            </div>
            {timePairs.length > 1 && (
              <button
                type="button"
                onClick={() => removeTimePair(index)}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Time Pair Button */}
      <button
        type="button"
        onClick={addTimePair}
        className="flex items-center justify-center w-full gap-1 text-xs text-blue-600 hover:text-blue-700 py-1 border border-dashed border-blue-300 rounded hover:bg-blue-50"
      >
        <PlusIcon className="h-3 w-3" />
        Add Clock In/Out
      </button>

      {/* Calculated Hours Display */}
      {totalCalculatedHours > 0 && !manualOverride && (
        <div className="text-xs bg-gray-50 rounded p-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Regular:</span>
            <span className="font-medium">{calculatedRegular}h</span>
          </div>
          {calculatedOvertime > 0 && (
            <div className="flex justify-between text-orange-600">
              <span>Overtime:</span>
              <span className="font-medium">{calculatedOvertime}h</span>
            </div>
          )}
          <div className="flex justify-between border-t mt-1 pt-1 font-semibold">
            <span>Total:</span>
            <span>{totalCalculatedHours}h</span>
          </div>
        </div>
      )}

      {/* Manual Override Toggle */}
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={manualOverride}
          onChange={(e) => setManualOverride(e.target.checked)}
          className="rounded text-blue-600"
        />
        Enter hours manually
      </label>

      {/* Manual Hours Input (shown when override is checked) */}
      {manualOverride && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Regular</label>
              <input
                type="number"
                step="0.25"
                value={manualRegular}
                onChange={(e) => setManualRegular(parseFloat(e.target.value) || 0)}
                className="w-full rounded border px-2 py-1 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Overtime</label>
              <input
                type="number"
                step="0.25"
                value={manualOvertime}
                onChange={(e) => setManualOvertime(parseFloat(e.target.value) || 0)}
                className="w-full rounded border px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded border px-2 py-1 text-xs"
      />

      {/* Action Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={handleSave}
          disabled={!manualOverride && totalCalculatedHours === 0}
          className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Helper functions
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Sunday is 0
  return new Date(d.setDate(diff));
}

function getEndOfWeek(date: Date): Date {
  const d = new Date(getStartOfWeek(date));
  d.setDate(d.getDate() + 6);
  return d;
}

function getWeekDays(startDate: Date): Date[] {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    days.push(day);
  }
  return days;
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDayOfWeek(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDayMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
