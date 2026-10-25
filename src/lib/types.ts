export type Patient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female';
  birth_date: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  category: string;
  created_at: string;
};

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type Appointment = {
  id: string;
  patient_id: string;
  service_id: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
};

export type AppointmentWithRelations = Appointment & {
  patient: Pick<Patient, 'id' | 'name' | 'phone'> | null;
  service: Pick<Service, 'id' | 'name' | 'duration_min' | 'price'> | null;
};

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  service_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  total: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  total: number;
  paid: number;
  status: InvoiceStatus;
  issued_at: string;
  due_at: string | null;
  notes: string | null;
  created_at: string;
};

export type InvoiceWithRelations = Invoice & {
  patient: Pick<Patient, 'id' | 'name' | 'phone'> | null;
  appointment: Pick<Appointment, 'id' | 'start_time'> | null;
  invoice_items: InvoiceItem[];
};

export type Settings = {
  id: number;
  clinic_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  n8n_webhook_url: string | null;
  n8n_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type WebhookEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  response: string | null;
  created_at: string;
};

export const SERVICE_CATEGORIES: Record<string, string> = {
  general: 'عام',
  cleaning: 'تنظيف',
  restoration: 'ترميم',
  endodontics: 'علاج العصب',
  surgery: 'جراحة',
  orthodontics: 'تقويم',
  cosmetic: 'تجميل',
  other: 'أخرى',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'مجدول',
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  no_show: 'لم يحضر',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'غير مدفوعة',
  partial: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
};
