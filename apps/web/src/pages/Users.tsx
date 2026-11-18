import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users as UsersIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/toast';
import type { Role, User } from '../lib/types';
import { fmtDate, fmtNum } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  StatCard,
} from '../components/ui/primitives';
import { ConfirmDialog, Modal } from '../components/ui/overlay';
import { DataTable, type Column } from '../components/ui/data-table';

const ROLE_LABEL: Record<Role, string> = { OWNER: 'مالك', SELLER: 'بائع' };

interface AddForm {
  name: string;
  username: string;
  password: string;
  confirm: string;
  role: Role;
  active: boolean;
}

function emptyAdd(): AddForm {
  return { name: '', username: '', password: '', confirm: '', role: 'SELLER', active: true };
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();

  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState<AddForm>(emptyAdd);
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('SELLER');
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  const [resetting, setResetting] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [toggling, setToggling] = useState<User | null>(null);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });

  const users = data ?? [];

  const stats = useMemo(() => {
    const owners = users.filter((u) => u.role === 'OWNER');
    const sellers = users.filter((u) => u.role === 'SELLER');
    return {
      owners: owners.length,
      sellers: sellers.length,
      active: users.filter((u) => u.active !== false).length,
    };
  }, [users]);

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
    ]);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<User>('/users', {
        name: add.name.trim(),
        username: add.username.trim(),
        password: add.password,
        role: add.role,
        active: add.active,
      }),
    onSuccess: async () => {
      toast.success('تم إنشاء المستخدم بنجاح');
      setAddOpen(false);
      setAdd(emptyAdd());
      setAddError(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر إنشاء المستخدم';
      setAddError(message);
      toast.error(message);
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api.patch<User>(`/users/${editing?.id}`, {
        name: editName.trim(),
        ...(editing?.id === me?.id ? {} : { role: editRole, active: editActive }),
      }),
    onSuccess: async () => {
      toast.success('تم تحديث بيانات المستخدم');
      setEditing(null);
      setEditError(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر تحديث المستخدم';
      setEditError(message);
      toast.error(message);
    },
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/users/${resetting?.id}/password`, { password }),
    onSuccess: async () => {
      toast.success('تم تغيير كلمة المرور وإنهاء جلسات المستخدم');
      setResetting(null);
      setPassword('');
      setConfirm('');
      setPasswordError(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور';
      setPasswordError(message);
      toast.error(message);
    },
  });

  const toggleActive = useMutation({
    mutationFn: (target: User) => api.patch<User>(`/users/${target.id}`, { active: target.active === false }),
    onSuccess: async () => {
      toast.success('تم تحديث حالة الحساب');
      setToggling(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'تعذر تحديث حالة الحساب');
      setToggling(null);
    },
  });

  function startAdd() {
    setAdd(emptyAdd());
    setAddError(null);
    setAddOpen(true);
  }

  function submitAdd() {
    if (add.name.trim().length < 2) {
      setAddError('الاسم يجب أن يكون حرفين على الأقل');
      return;
    }
    if (add.username.trim().length < 3) {
      setAddError('اسم الدخول يجب أن يكون 3 أحرف على الأقل');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(add.username.trim())) {
      setAddError('اسم الدخول يقبل حروفاً لاتينية وأرقاماً ونقطة/شرطة فقط');
      return;
    }
    if (add.password.length < 8) {
      setAddError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (add.password !== add.confirm) {
      setAddError('كلمتا المرور غير متطابقتين');
      return;
    }
    setAddError(null);
    create.mutate();
  }

  function openEdit(target: User) {
    setEditing(target);
    setEditName(target.name);
    setEditRole(target.role);
    setEditActive(target.active !== false);
    setEditError(null);
  }

  function submitEdit() {
    if (editName.trim().length < 2) {
      setEditError('الاسم يجب أن يكون حرفين على الأقل');
      return;
    }
    setEditError(null);
    update.mutate();
  }

  function openReset(target: User) {
    setResetting(target);
    setPassword('');
    setConfirm('');
    setPasswordError(null);
  }

  function submitReset() {
    if (password.length < 8) {
      setPasswordError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (password !== confirm) {
      setPasswordError('كلمتا المرور غير متطابقتين');
      return;
    }
    setPasswordError(null);
    resetPassword.mutate();
  }

  const columns: Array<Column<User>> = [
    {
      key: 'user',
      header: 'المستخدم',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-goldsoft text-[13px] font-bold text-gold">
            {row.name.trim().charAt(0) || '?'}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-text">
              {row.name}
              {row.id === me?.id ? <Badge tone="info">أنت</Badge> : null}
            </p>
            <p className="truncate font-mono text-[10px] text-muted" dir="ltr">
              @{row.username}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'الدور',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.role === 'OWNER' ? 'gold' : 'muted'}>{ROLE_LABEL[row.role]}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.active === false ? 'danger' : 'success'} dot>
          {row.active === false ? 'معطّل' : 'نشط'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'أُضيف',
      hideOnMobile: true,
      cell: (row) => <span className="text-[11px] tabular-nums text-muted">{fmtDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'end',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`تعديل ${row.name}`}
            title="تعديل البيانات"
            onClick={() => openEdit(row)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`تغيير كلمة مرور ${row.name}`}
            title="تغيير كلمة المرور"
            onClick={() => openReset(row)}
          >
            <KeyRound className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={row.active === false ? `تفعيل ${row.name}` : `تعطيل ${row.name}`}
            title={
              row.id === me?.id
                ? 'لا يمكنك تعطيل حسابك الحالي'
                : row.active === false
                  ? 'تفعيل الحساب'
                  : 'تعطيل الحساب'
            }
            disabled={row.id === me?.id}
            className={row.active === false ? 'text-success hover:bg-successsoft' : 'text-danger hover:bg-dangersoft'}
            onClick={() => setToggling(row)}
          >
            <Power className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const editingSelf = editing?.id === me?.id;

  return (
    <div className="space-y-4">
      <PageHeader
        title="المستخدمون"
        subtitle="إدارة حسابات المالك والبائعين، الأدوار، وكلمات المرور."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={startAdd}>
              مستخدم جديد
            </Button>
          </>
        }
      />

      {isError ? (
        <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
          تعذر تحميل المستخدمين: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="إجمالي المستخدمين"
            value={fmtNum(users.length)}
            hint={`${fmtNum(stats.active)} حساب نشط`}
            icon={UsersIcon}
            tone="info"
          />
          <StatCard
            label="المالك"
            value={fmtNum(stats.owners)}
            hint="صلاحية كاملة على التقارير والإعدادات"
            icon={ShieldCheck}
            tone="gold"
          />
          <StatCard
            label="البائعون"
            value={fmtNum(stats.sellers)}
            hint="بيع، جرد، وإضافة أصناف"
            icon={UserRound}
            tone="success"
          />
          <StatCard
            label="حسابات معطّلة"
            value={fmtNum(users.length - stats.active)}
            hint="لا يمكنها تسجيل الدخول"
            icon={Power}
            tone={users.length - stats.active > 0 ? 'warning' : 'muted'}
          />
        </div>
      )}

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle
            title="حسابات النظام"
            description="لا يمكن تعطيل آخر مالك نشط. تغيير كلمة مرور مستخدم ينهي جلساته المفتوحة."
            action={<Badge tone="muted">{fmtNum(users.length)} حساب</Badge>}
          />
        </div>

        <DataTable
          rows={users}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={UsersIcon}
              title="لا مستخدمون"
              description="أضف حساب بائع أو مالك للبدء."
              action={
                <Button variant="primary" icon={UserPlus} onClick={startAdd}>
                  مستخدم جديد
                </Button>
              }
            />
          }
        />
      </Card>

      {/* إضافة مستخدم */}
      <Modal
        open={addOpen}
        onClose={() => {
          if (!create.isPending) setAddOpen(false);
        }}
        title="مستخدم جديد"
        description="أنشئ حساباً بدور بائع أو مالك بصلاحيات مختلفة."
        size="md"
        footer={
          <>
            <Button variant="ghost" disabled={create.isPending} onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" icon={Plus} loading={create.isPending} onClick={submitAdd}>
              إنشاء الحساب
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {addError ? (
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3 py-2 text-xs font-medium text-danger">
              {addError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الاسم الكامل" required className="sm:col-span-2">
              <Input
                value={add.name}
                onChange={(e) => setAdd({ ...add, name: e.target.value })}
                placeholder="مثال: محمد علي"
                maxLength={160}
                autoFocus
              />
            </Field>
            <Field label="اسم الدخول" required hint="حروف لاتينية وأرقام فقط.">
              <Input
                value={add.username}
                onChange={(e) => setAdd({ ...add, username: e.target.value })}
                placeholder="mohamed"
                className="ltr-nums text-start"
                maxLength={60}
                autoComplete="off"
              />
            </Field>
            <Field label="الدور" required>
              <Select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as Role })}>
                <option value="SELLER">بائع</option>
                <option value="OWNER">مالك</option>
              </Select>
            </Field>
            <Field label="كلمة المرور" required hint="8 أحرف على الأقل.">
              <Input
                type="password"
                value={add.password}
                onChange={(e) => setAdd({ ...add, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <Field label="تأكيد كلمة المرور" required>
              <Input
                type="password"
                value={add.confirm}
                onChange={(e) => setAdd({ ...add, confirm: e.target.value })}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdd();
                }}
              />
            </Field>
          </div>

          <Checkbox
            checked={add.active}
            onChange={(v) => setAdd({ ...add, active: v })}
            label="الحساب نشط ويمكنه تسجيل الدخول مباشرة"
          />
        </div>
      </Modal>

      {/* تعديل مستخدم */}
      <Modal
        open={editing !== null}
        onClose={() => {
          if (!update.isPending) setEditing(null);
        }}
        title={`تعديل ${editing?.name ?? ''}`}
        description={editing ? `اسم الدخول @${editing.username}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={update.isPending} onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button variant="primary" icon={Pencil} loading={update.isPending} onClick={submitEdit}>
              حفظ التعديلات
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {editError ? (
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3 py-2 text-xs font-medium text-danger">
              {editError}
            </div>
          ) : null}

          <Field label="الاسم الكامل" required>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={160} autoFocus />
          </Field>

          {editingSelf ? (
            <p className="rounded-lg bg-surface2/60 px-3 py-2 text-[11px] leading-5 text-muted">
              لا يمكنك تغيير دورك أو تعطيل حسابك من هذه الشاشة. استعمل حساب مالك آخر إن لزم.
            </p>
          ) : (
            <>
              <Field label="الدور">
                <Select value={editRole} onChange={(e) => setEditRole(e.target.value as Role)}>
                  <option value="SELLER">بائع</option>
                  <option value="OWNER">مالك</option>
                </Select>
              </Field>
              <Checkbox
                checked={editActive}
                onChange={setEditActive}
                label="الحساب نشط ويمكنه تسجيل الدخول"
              />
              {!editActive ? (
                <p className="rounded-lg bg-warningsoft px-3 py-2 text-[11px] leading-5 text-text">
                  تعطيل الحساب ينهي جلساته الحالية فوراً ولا يمكنه الدخول حتى تُعيد تفعيله.
                </p>
              ) : null}
            </>
          )}
        </div>
      </Modal>

      {/* تغيير كلمة المرور */}
      <Modal
        open={resetting !== null}
        onClose={() => {
          if (!resetPassword.isPending) setResetting(null);
        }}
        title={`كلمة مرور ${resetting?.name ?? ''}`}
        description="ستُنهى جميع جلسات هذا المستخدم بعد التغيير."
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={resetPassword.isPending} onClick={() => setResetting(null)}>
              إلغاء
            </Button>
            <Button variant="primary" icon={KeyRound} loading={resetPassword.isPending} onClick={submitReset}>
              تغيير كلمة المرور
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {passwordError ? (
            <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3 py-2 text-xs font-medium text-danger">
              {passwordError}
            </div>
          ) : null}

          <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل.">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </Field>
          <Field label="تأكيد كلمة المرور" required>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitReset();
              }}
            />
          </Field>
          <p className="rounded-lg bg-warningsoft px-3 py-2 text-[11px] leading-5 text-text">
            سلّم كلمة المرور للمستخدم مباشرة ولا تشاركها مع أي شخص آخر.
          </p>
        </div>
      </Modal>

      {/* تعطيل / تفعيل */}
      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling?.active === false
            ? `تفعيل حساب ${toggling?.name ?? ''}؟`
            : `تعطيل حساب ${toggling?.name ?? ''}؟`
        }
        description={
          toggling?.active === false
            ? 'سيتمكن المستخدم من تسجيل الدخول مرة أخرى.'
            : 'سيتم إنهاء جلساته الحالية ومنعه من الدخول حتى إعادة تفعيله.'
        }
        confirmLabel={toggling?.active === false ? 'تفعيل' : 'تعطيل'}
        cancelLabel="رجوع"
        tone={toggling?.active === false ? 'primary' : 'danger'}
        loading={toggleActive.isPending}
        onCancel={() => setToggling(null)}
        onConfirm={() => {
          if (toggling) toggleActive.mutate(toggling);
        }}
      >
        {toggling?.role === 'OWNER' ? (
          <p className="text-[11px] leading-5 text-muted">
            هذا الحساب مالك. لا يمكن تعطيل آخر مالك نشط في النظام.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
