import React, { useMemo, useState } from 'react';
import { Users, Plus, Pencil, Search, ShieldCheck, KeyRound, AlertTriangle, Send, Loader2, CheckCircle2 } from 'lucide-react';
import type { AppUser, NewAppUser, UserRole } from '../types/crm';
import { ROLE_LABEL } from '../lib/permissions';
import { MIN_PASSWORD_LENGTH } from '../lib/tenantGuards';
import { cardClass, formatDate, inputClass, labelClass, primaryButton, secondaryButton, tableCell, tableHeadRow } from '../lib/styles';
import { ActiveSwitch, EmptyState, Modal, Pill } from './ui';

// Mensaje de error, o null si se guardó. Con Supabase la respuesta llega después (promesa).
type SaveResult = string | null;

interface TeamUsersSectionProps {
  users: AppUser[]; // usuarios del propio CRM
  currentUserId: string;
  onCreateUser: (user: NewAppUser) => SaveResult | Promise<SaveResult>;
  onUpdateUser: (user: AppUser) => SaveResult | Promise<SaveResult>;
  /** Con Supabase: se invita por correo y la persona elige su contraseña */
  invitations?: boolean;
}

// Roles que puede asignar el gerente (el administrador de plataforma no se crea desde aquí)
const ROLES: { id: Exclude<UserRole, 'superadmin'>; label: string; description: string }[] = [
  { id: 'agent', label: 'Usuario base', description: 'Captura leads, los avanza en el pipeline y registra contactos.' },
  { id: 'manager', label: 'Gerente', description: 'Todo lo del usuario base + KPI, gerencia, catálogo, auditoría y usuarios.' },
];

export const TeamUsersSection: React.FC<TeamUsersSectionProps> = ({
  users,
  currentUserId,
  onCreateUser,
  onUpdateUser,
  invitations = false,
}) => {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  const quickUpdate = async (user: AppUser) => setRowError(await onUpdateUser(user));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => roleFilter === 'all' || u.role === roleFilter)
      .filter((u) => !q || `${u.fullName} ${u.email}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName, 'es'));
  }, [users, query, roleFilter]);

  const activos = users.filter((u) => u.isActive).length;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Usuarios del CRM</h3>
          <p className="text-sm text-slate-400">
            {activos} activos · {users.length - activos} desactivados. Un usuario desactivado no puede iniciar sesión, pero su
            historial se conserva.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o email..."
              aria-label="Buscar usuario"
              className={`${inputClass} w-60! pl-10`}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            aria-label="Filtrar por perfil"
            className={`${inputClass} w-44!`}
          >
            <option value="all">Todos los perfiles</option>
            <option value="manager">Gerentes</option>
            <option value="agent">Usuarios base</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setInvited(null);
              setEditing('new');
            }}
            className={primaryButton}
          >
            {invitations ? <Send className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {invitations ? 'Invitar usuario' : 'Nuevo usuario'}
          </button>
        </div>
      </div>

      {rowError && (
        <div role="alert" className="flex items-start justify-between gap-3 border-b border-slate-700 bg-rose-500/10 px-5 py-3 text-[15px] text-rose-300">
          <span className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            {rowError}
          </span>
          <button type="button" onClick={() => setRowError(null)} className="cursor-pointer text-sm font-semibold text-rose-200 hover:underline">
            Cerrar
          </button>
        </div>
      )}
      {invited && (
        <p role="status" className="flex gap-2 border-b border-slate-700 bg-emerald-500/10 px-5 py-3 text-[15px] text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Invitación enviada a {invited}. La persona elige su contraseña al abrir el correo; nadie más la conoce.</span>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Users} title="Sin resultados" description="Ningún usuario coincide con la búsqueda." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[15px]">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableCell}>Usuario</th>
                <th className={tableCell}>Perfil</th>
                <th className={tableCell}>Creado</th>
                <th className={tableCell}>Estado</th>
                <th className={`${tableCell} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {rows.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className={user.isActive ? '' : 'bg-slate-950/40'}>
                    <td className={tableCell}>
                      <div className={`font-semibold ${user.isActive ? 'text-slate-100' : 'text-slate-400'}`}>
                        {user.fullName}
                        {isSelf && <span className="ml-1.5 text-sm font-normal text-slate-400">(tú)</span>}
                      </div>
                      <div className="text-sm text-slate-400">{user.email}</div>
                    </td>
                    <td className={tableCell}>
                      <Pill tone={user.role === 'manager' ? 'indigo' : 'slate'}>
                        {user.role === 'manager' && <ShieldCheck className="h-3.5 w-3.5" />}
                        {ROLE_LABEL[user.role]}
                      </Pill>
                    </td>
                    <td className={`${tableCell} whitespace-nowrap text-slate-300`}>{formatDate(user.createdAt)}</td>
                    <td className={tableCell}>
                      <div className="flex items-center gap-2.5">
                        <ActiveSwitch
                          checked={user.isActive}
                          onChange={(isActive) => void quickUpdate({ ...user, isActive })}
                          disabled={isSelf}
                          label={
                            isSelf
                              ? 'No puedes desactivar tu propio usuario'
                              : user.isActive
                                ? `Desactivar a ${user.fullName}`
                                : `Activar a ${user.fullName}`
                          }
                        />
                        <span className={`text-sm font-semibold ${user.isActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                          {user.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </td>
                    <td className={`${tableCell} text-right`}>
                      <button
                        type="button"
                        onClick={() => setEditing(user)}
                        aria-label={`Editar a ${user.fullName}`}
                        title="Editar"
                        className={`${secondaryButton} px-2.5 py-2 text-sm`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TeamUserModal
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === currentUserId}
          invitation={invitations}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing !== 'new') {
              return onUpdateUser({ ...editing, fullName: data.fullName, role: data.role, isActive: data.isActive });
            }
            const error = await onCreateUser(data);
            if (!error && invitations) setInvited(data.email);
            return error;
          }}
        />
      )}
    </div>
  );
};

function TeamUserModal({
  user,
  isSelf,
  invitation,
  onClose,
  onSave,
}: {
  user: AppUser | null;
  isSelf: boolean;
  invitation: boolean;
  onClose: () => void;
  onSave: (data: NewAppUser) => Promise<SaveResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<UserRole, 'superadmin'>>(user?.role === 'manager' ? 'manager' : 'agent');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const result = await onSave({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password: invitation ? '' : password,
      role,
      isActive,
      companyId: user?.companyId ?? null,
    });
    setBusy(false);
    if (result) setError(result);
    else onClose();
  };

  const creating = !user;

  return (
    <Modal
      title={user ? 'Editar usuario' : invitation ? 'Invitar a alguien al CRM' : 'Nuevo usuario del CRM'}
      subtitle={
        user
          ? user.email
          : invitation
            ? 'Le llegará un correo para elegir su contraseña. Solo esa persona la conocerá.'
            : 'Podrá iniciar sesión con el email y la contraseña que definas'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="team-user-form" disabled={busy} className={primaryButton}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {user ? 'Guardar cambios' : invitation ? 'Enviar invitación' : 'Crear usuario'}
          </button>
        </>
      }
    >
      <form
        id="team-user-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        {error && (
          <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="tu-name" className={labelClass}>Nombre completo *</label>
          <input id="tu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="tu-email" className={labelClass}>Email *</label>
          <input
            id="tu-email"
            type="email"
            value={email}
            disabled={Boolean(user)}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          {user && <p className="mt-1 text-sm text-slate-400">El email no se puede cambiar: es la identidad de la cuenta.</p>}
        </div>

        {creating && !invitation && (
          <div>
            <label htmlFor="tu-password" className={labelClass}>Contraseña temporal *</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="tu-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                className={`${inputClass} pl-10`}
              />
            </div>
            <p className="mt-1 text-sm text-slate-400">Entrégala por un canal seguro y pide que la cambie al entrar.</p>
          </div>
        )}

        <fieldset>
          <legend className={labelClass}>Perfil *</legend>
          <div className="space-y-2">
            {ROLES.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                  role === option.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="tu-role"
                  value={option.id}
                  checked={role === option.id}
                  disabled={isSelf}
                  onChange={() => setRole(option.id)}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-[15px] font-semibold text-slate-100">{option.label}</span>
                  <span className="block text-sm text-slate-400">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          {isSelf && <p className="mt-1 text-sm text-slate-400">No puedes cambiar tu propio perfil ni desactivarte.</p>}
        </fieldset>

        <div className="flex items-center gap-3">
          <ActiveSwitch checked={isActive} onChange={setIsActive} disabled={isSelf} label="Usuario activo" />
          <span className="text-[15px] text-slate-300">Usuario activo (puede iniciar sesión)</span>
        </div>
      </form>
    </Modal>
  );
}
