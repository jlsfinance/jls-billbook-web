import { WorkspaceHeading, workspace } from './WorkspaceUI';
import React, { useState } from 'react';
import { Plus, Trash2, Shield, Pencil } from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { StorageService } from '../services/storageService';
import { ConfirmationModal } from './ConfirmationModal';

interface StaffAndRolesProps {
  onBack?: () => void;
  onOpenAccountant?: () => void;
}

const ROLE_PRESETS: Record<StaffRole, string[]> = {
  OWNER: ['ALL_ACCESS'],
  ADMIN: ['SALES', 'PURCHASE', 'INVENTORY', 'CASH_BANK', 'REPORTS'],
  SALESMAN: ['CREATE_SALE', 'QUOTATIONS', 'VIEW_STOCK', 'RECORD_RECEIPT'],
  STOCK_MANAGER: ['INVENTORY', 'STOCK_IN', 'GODOWNS', 'BARCODE_LABELS'],
  CA_VIEWER: ['VIEW_REPORTS', 'GST_EXPORT', 'TALLY_EXPORT'],
};

export const StaffAndRoles: React.FC<StaffAndRolesProps> = ({ onBack, onOpenAccountant }) => {
  const [staff, setStaff] = useState<StaffMember[]>(() => StorageService.getStaffMembers());
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('SALESMAN');
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const refresh = () => setStaff(StorageService.getStaffMembers());

  function openMember(member: StaffMember | null) {
    setEditing(member);
    setName(member?.name ?? '');
    setPhone(member?.phone ?? '');
    setEmail(member?.email ?? '');
    setRole(member?.role ?? 'SALESMAN');
    setShowAdd(true);
  }
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    StorageService.saveStaffMember({
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      role,
      permissions: ROLE_PRESETS[role],
      active: editing?.active ?? true,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    });
    setShowAdd(false);
    setName('');
    setPhone('');
    setEmail('');
    refresh();
  };

  return (
    <div className="min-h-screen bg-surface-container-low pb-28">
      <div className={workspace.titleBand}>
        <WorkspaceHeading title="Staff & Roles" onBack={onBack} actions={
          <button type="button" onClick={() => openMember(null)} className={workspace.primary}>
          <Plus className="w-4 h-4" /> Add Staff
        </button>
        }>
          Manage staff records and assigned responsibilities.
        </WorkspaceHeading>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 space-y-3">
        {onOpenAccountant && <button type="button" onClick={onOpenAccountant} className="rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold">Share records with an accountant</button>}
        {staff.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center text-slate-400">
            No team members added yet. Add a salesman, stock manager, or CA viewer.
          </div>
        ) : (
          staff.map((m) => (
            <div key={m.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-black">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-black">{m.name}</h3>
                  <p className="text-xs text-slate-500">{m.phone}{m.email ? ` · ${m.email}` : ''}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.permissions.map((perm) => (
                      <span key={perm} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-[10px] font-black flex items-center gap-1">
                  <Shield className="w-3 h-3" /> {m.role.replace('_', ' ')}
                </span>
                <button type="button" onClick={() => { StorageService.saveStaffMember({ ...m, active: !m.active }); refresh(); }}
                  className="rounded-xl border px-2 py-1.5 text-xs">{m.active ? 'Mark inactive' : 'Mark active'}</button>
                <button type="button" aria-label={`Edit ${m.name}`} onClick={() => openMember(m)} className="rounded-xl border p-2"><Pencil size={16} /></button>
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => setRemoving(m)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-lg font-black">{editing ? 'Edit team member' : 'Add team member'}</h3>
            <input required placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <input required placeholder="Mobile Number" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              <option value="SALESMAN">Salesman (Billing &amp; Collections)</option>
              <option value="STOCK_MANAGER">Stock Manager (Inventory &amp; Godowns)</option>
              {editing?.role === 'OWNER' && <option value="OWNER">Owner</option>}
              <option value="CA_VIEWER">CA / Auditor</option>
              <option value="ADMIN">Admin</option>
            </select>
            <p className="text-xs text-muted-foreground">Roles here are staff records. Accountant links control access to shared workbooks.</p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cancel</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-bold text-xs">Save Staff</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmationModal isOpen={Boolean(removing)} title="Remove staff record?" message="This removes the member from this company's staff list."
        variant="danger" confirmText="Remove staff record" onClose={() => setRemoving(null)} onConfirm={() => {
          if (!removing) return;
          StorageService.deleteStaffMember(removing.id);
          setRemoving(null);
          refresh();
        }} />
    </div>
  );
};

export default StaffAndRoles;
