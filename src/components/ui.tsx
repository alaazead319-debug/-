import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center text-slate-400">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="text-base font-bold text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد الحذف',
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm animate-fade-in rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <div className="mt-5 flex gap-2">
          <button disabled={loading} onClick={onCancel} className="btn-secondary flex-1">
            إلغاء
          </button>
          <button disabled={loading} onClick={onConfirm} className="btn-danger flex-1">
            {loading ? 'جارٍ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
