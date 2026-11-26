import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { localDay } from '../services/businessReports';
import { Calendar } from './ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { workspace } from './WorkspaceUI';

export type PartyRange = { from: string; to: string };

const localDate = (day: string) => new Date(day + 'T00:00:00');
const display = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function PartyDateRange({ value, onChange }: {
  value: PartyRange;
  onChange: (range: PartyRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>();
  const [month, setMonth] = useState(() => localDate(value.from));
  const today = new Date();

  const updateOpen = (next: boolean) => {
    if (next) {
      setMonth(localDate(value.from));
      setDraft(undefined);
    }
    setOpen(next);
  };
  const pickMonth = (offset: number) => {
    const from = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    setMonth(from);
    setDraft({ from, to: new Date(today.getFullYear(), today.getMonth() + offset + 1, 0) });
  };

  return <Dialog open={open} onOpenChange={updateOpen}>
    <DialogTrigger asChild>
      <button type="button" aria-label="Choose date range" className={workspace.secondary + ' flex w-full flex-wrap justify-start gap-x-3 gap-y-1 sm:w-auto'}>
        <CalendarDays size={16} className="shrink-0 text-primary" />
        <span className="text-xs"><span className="text-muted-foreground">From</span> {display.format(localDate(value.from))}</span>
        <span className="text-xs"><span className="text-muted-foreground">To</span> {display.format(localDate(value.to))}</span>
      </button>
    </DialogTrigger>
    <DialogContent className="z-[80] w-[calc(100%_-_1rem)] max-h-[88dvh] max-w-sm overflow-y-auto gap-3 rounded-2xl p-4">
      <DialogHeader className="pr-7 text-left">
        <DialogTitle>Choose date range</DialogTitle>
        <DialogDescription>Select a start date and an end date.</DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <button type="button" onClick={() => pickMonth(0)} className={workspace.secondary + ' !min-h-8 !px-2.5 !text-xs'}>This month</button>
        <button type="button" onClick={() => pickMonth(-1)} className={workspace.secondary + ' !min-h-8 !px-2.5 !text-xs'}>Last month</button>
      </div>
      <Calendar mode="range" month={month} onMonthChange={setMonth} selected={draft} onSelect={setDraft}
        captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)} showOutsideDays={false}
        className="mx-auto rounded-xl border border-border p-2 [--cell-size:2.25rem]" />
      <div className="flex items-center justify-between gap-2">
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {draft?.from ? display.format(draft.from) + (draft.to ? ' – ' + display.format(draft.to) : '') : 'Choose your dates'}
        </span>
        <button type="button" disabled={!draft?.from || !draft.to} className={workspace.primary + ' shrink-0'} onClick={() => {
          if (!draft?.from || !draft.to) return;
          onChange({ from: localDay(draft.from), to: localDay(draft.to) });
          setOpen(false);
        }}>Apply dates</button>
      </div>
    </DialogContent>
  </Dialog>;
}
