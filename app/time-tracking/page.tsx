'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';

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
  const [regularHours, setRegularHours] = useState(entry?.hoursWorked || 0);
  const [overtimeHours, setOvertimeHours] = useState(entry?.overtimeHours || 0);
  const [notes, setNotes] = useState(entry?.notes || '');

  const handleSave = () => {
    onSave(regularHours, overtimeHours, notes);
  };

  return (
    <div className="space-y-2 rounded border-2 border-blue-500 bg-white p-3 shadow-lg">
      <input
        type="number"
        step="0.25"
        value={regularHours}
        onChange={(e) => setRegularHours(parseFloat(e.target.value) || 0)}
        placeholder="Reg hours"
        className="w-full rounded border px-2 py-1 text-sm"
        autoFocus
      />
      <input
        type="number"
        step="0.25"
        value={overtimeHours}
        onChange={(e) => setOvertimeHours(parseFloat(e.target.value) || 0)}
        placeholder="OT hours"
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <div className="flex space-x-2">
        <button
          onClick={handleSave}
          className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
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
