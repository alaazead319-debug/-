import type { AppointmentStatus, InvoiceStatus } from './types';

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + ' ر.س';
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ar-EG').format(n);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const appointmentColor: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  no_show: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export function appointmentStatusClass(status: AppointmentStatus): string {
  return appointmentColor[status] ?? appointmentColor.scheduled;
}

const invoiceColor: Record<InvoiceStatus, string> = {
  unpaid: 'bg-rose-50 text-rose-700 ring-rose-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  void: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function invoiceStatusClass(status: InvoiceStatus): string {
  return invoiceColor[status] ?? invoiceColor.unpaid;
}

export function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  const diff = Date.now() - d.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age > 0 && age < 120 ? age : null;
}
