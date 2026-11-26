import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { localDay } from '../services/businessReports';
import { Calendar } from './ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { workspace } from './WorkspaceUI';

export type PartyRange = { from: string; to: string };

type Endpoint = keyof PartyRange;
type DateSelection = { from: Date; to?: Date };

const localDate = (day: string) => new Date(day + 'T00:00:00');
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const display = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const months = Array.from({ length: 12 }, (_, index) => monthName.format(new Date(2000, index)));
const firstYear = 1900;
const lastYear = 2100;
const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
const endpoints = [{ id: 'from', label: 'From' }, { id: 'to', label: 'To' }] as const;

export default function PartyDateRange({ value, onChange }: {
  value: PartyRange;
  onChange: (range: PartyRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState<Endpoint>('from');
  const [draft, setDraft] = useState<DateSelection>(() => ({ from: localDate(value.from), to: localDate(value.to) }));
  const [month, setMonth] = useState(() => monthStart(localDate(value.from)));

  function updateOpen(next: boolean) {
    if (next) {
      const from = localDate(value.from);
      setDraft({ from, to: localDate(value.to) });
      setEndpoint('from');
      setMonth(monthStart(from));
    }
    setOpen(next);
  }

  function editDate(next: Endpoint) {
    setEndpoint(next);
    setMonth(monthStart(draft[next] ?? draft.from));
  }

  function chooseDate(date: Date) {
    if (endpoint === 'from') {
      const to = draft.to && date <= draft.to ? draft.to : undefined;
      setDraft({ from: date, to });
      setEndpoint('to');
      setMonth(monthStart(date));
    } else {
      setDraft({ from: draft.from, to: date });
    }
  }

  function pickMonth(offset: number) {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    setMonth(from);
    setDraft({ from, to: new Date(from.getFullYear(), from.getMonth() + 1, 0) });
    setEndpoint('to');
  }

  function moveMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    if (next.getFullYear() >= firstYear && next.getFullYear() <= lastYear) setMonth(next);
  }

  const canApply = Boolean(draft.to && draft.to >= draft.from);
  const otherDate = endpoint === 'from' ? draft.to : draft.from;

  return <Dialog open={open} onOpenChange={updateOpen}>
    <DialogTrigger asChild>
      <button type="button" aria-label="Choose date range" className={workspace.secondary + ' flex w-full flex-wrap justify-start gap-x-3 gap-y-1 sm:w-auto'}>
        <CalendarDays size={16} className="shrink-0 text-primary" />
        <span className="text-xs"><span className="text-muted-foreground">From</span> {display.format(localDate(value.from))}</span>
        <span className="text-xs"><span className="text-muted-foreground">To</span> {display.format(localDate(value.to))}</span>
      </button>
    </DialogTrigger>
    <DialogContent className="z-[80] w-[calc(100%_-_1rem)] max-h-[calc(100dvh_-_1rem)] max-w-sm overflow-y-auto overscroll-contain gap-2.5 rounded-2xl p-3 sm:p-4">
      <DialogHeader className="pr-7 text-left">
        <DialogTitle>Choose date range</DialogTitle>
        <DialogDescription className="sr-only">Choose From and To dates, then apply the range.</DialogDescription>
      </DialogHeader>
      <div role="group" aria-label="Date to edit" className="grid grid-cols-2 gap-2">
        {endpoints.map(({ id, label }) => <button type="button" key={id} aria-pressed={endpoint === id}
          onClick={() => editDate(id)}
          className={`min-h-11 rounded-xl border px-2 py-1.5 text-left ${endpoint === id ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}>
          <span className="block text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
          <span className="block text-xs font-semibold">{draft[id] ? display.format(draft[id]) : 'Select date'}</span>
        </button>)}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => pickMonth(0)} className={workspace.secondary + ' !min-h-8 !px-2.5 !text-xs'}>This month</button>
        <button type="button" onClick={() => pickMonth(-1)} className={workspace.secondary + ' !min-h-8 !px-2.5 !text-xs'}>Last month</button>
      </div>
      <div className="rounded-xl border border-border p-2">
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,0.7fr)_2.25rem] items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}
            disabled={month.getFullYear() === firstYear && month.getMonth() === 0}
            className="grid h-10 place-items-center rounded-lg hover:bg-accent disabled:opacity-40"><ChevronLeft size={17} /></button>
          <select aria-label="Choose the Month" value={month.getMonth()} onChange={event => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}
            className="h-10 min-w-0 rounded-lg border border-border bg-surface px-1 text-base font-semibold sm:text-sm">
            {months.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
          <select aria-label="Choose the Year" value={month.getFullYear()} onChange={event => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}
            className="h-10 min-w-0 rounded-lg border border-border bg-surface px-1 text-base font-semibold sm:text-sm">
            {years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}
            disabled={month.getFullYear() === lastYear && month.getMonth() === 11}
            className="grid h-10 place-items-center rounded-lg hover:bg-accent disabled:opacity-40"><ChevronRight size={17} /></button>
        </div>
        <Calendar mode="single" required month={month} onMonthChange={setMonth} selected={draft[endpoint]} onSelect={chooseDate}
          disabled={endpoint === 'to' ? { before: draft.from } : undefined}
          modifiers={{ otherDate: otherDate ? [otherDate] : [], inRange: draft.to ? [{ after: draft.from, before: draft.to }] : [] }}
          modifiersClassNames={{ otherDate: 'rounded-md bg-primary/15', inRange: 'bg-primary/5' }}
          hideNavigation showOutsideDays={false}
          className="w-full p-0 [--cell-size:2rem]"
          classNames={{ month_caption: 'sr-only', month: 'gap-1', week: 'mt-0' }} />
      </div>
      <p aria-live="polite" className="sr-only">{endpoint === 'from' ? 'Choose a start date' : 'Choose an end date'}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={workspace.secondary} onClick={() => updateOpen(false)}>Cancel</button>
        <button type="button" disabled={!canApply} className={workspace.primary} onClick={() => {
          if (!draft.to || !canApply) return;
          onChange({ from: localDay(draft.from), to: localDay(draft.to) });
          setOpen(false);
        }}>Apply dates</button>
      </div>
    </DialogContent>
  </Dialog>;
}
