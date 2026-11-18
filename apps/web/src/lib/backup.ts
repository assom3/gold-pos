import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useToast } from '../components/ui/toast';
import type { BackupOverview } from './types';

/** تشغيل نسخة احتياطية يدوية وتحديث الشاشات المرتبطة بها */
export function useRunBackup() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.post<BackupOverview>('/backups/run'),
    onSuccess: async (overview) => {
      const last = overview.runs[0];
      const warning = last?.error;
      if (warning) toast.info(`تمت النسخة الاحتياطية، لكن: ${warning}`);
      else toast.success('تمت النسخة الاحتياطية بنجاح');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['backups'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: async (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'تعذر إنشاء النسخة الاحتياطية');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['backups'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

/** تنزيل ملف نسخة: نتحقق من الاستجابة أولاً حتى لا ننتقل لصفحة JSON عند الخطأ */
export async function downloadBackup(id: number, fileName: string): Promise<void> {
  const res = await fetch(`/api/backups/${id}/download`, { credentials: 'include' });
  if (!res.ok) {
    let message = 'تعذر تنزيل النسخة';
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      if (json.error?.message) message = json.error.message;
    } catch {
      // نترك الرسالة الافتراضية
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
