import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Pencil } from 'lucide-react';
import { ROLES } from '../lib/requestTypes.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

const ROLE_HELP = {
  admin: 'Everything, including team and settings',
  reception: 'Chats, rooms, check-in, tasks, orders, menu, answers',
  housekeeping: 'Their rooms to clean + housekeeping tasks (towels, cleaning)',
  kitchen: 'Kitchen orders screen, sold-out switches, food tasks',
  maintenance: 'Repair tasks only (AC, lights, plumbing…)',
};

// Staff accounts (admin only). Department staff can use a simple username.
export default function Team({ call, staffId }) {
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => call('/api/staff/users').then(setUsers).catch(() => setUsers([])), [call]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="muted">Each person logs in to this app and sees only their own work.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}><UserPlus size={16} /> Add staff</button>
      </div>
      {users === null && <div className="chat-empty"><span className="spinner" /></div>}
      <div className="team-list">
        {users?.map((u) => (
          <div key={u.id} className={`team-row ${u.active ? '' : 'off'}`}>
            <div className="avatar avatar-sm">{u.name.slice(0, 1).toUpperCase()}</div>
            <div className="team-info">
              <strong>{u.name}{u.id === staffId && ' (you)'}</strong>
              <span className="muted small">{u.login}{u.floors && ` · floors ${u.floors}`}</span>
            </div>
            <span className={`status ${u.active ? 'status-green' : 'status-grey'}`}>{u.active ? ROLES[u.role] : 'Disabled'}</span>
            <button className="icon-btn" onClick={() => setEditing(u)} aria-label="Edit"><Pencil size={16} /></button>
          </div>
        ))}
      </div>
      {editing && <StaffForm user={editing} isSelf={editing.id === staffId} call={call} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function StaffForm({ user, isSelf, call, onClose, onSaved }) {
  const isNew = !user.id;
  const [form, setForm] = useState({
    name: user.name || '', login: user.login || '', password: '', role: user.role || 'reception', floors: user.floors || '', active: user.active ?? true,
  });
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isNew) {
        await call('/api/staff/users', { method: 'POST', body: { name: form.name, login: form.login, password: form.password, role: form.role, floors: form.floors } });
        toast(`${form.name} can now log in as “${form.login.toLowerCase()}”`, 'success');
      } else {
        const body = { name: form.name, role: form.role, floors: form.floors, active: form.active };
        if (form.password) body.password = form.password;
        await call(`/api/staff/users/${user.id}`, { method: 'PATCH', body });
        toast('Saved', 'success');
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={isNew ? 'Add staff member' : `Edit ${user.name}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} /></Field>
        <Field label="Login (email or username)" hint={isNew ? 'e.g. ravi.hk or ravi@hotel.com' : 'Cannot be changed'}>
          <input className="input" value={form.login} onChange={(e) => set('login', e.target.value)} required disabled={!isNew} autoCapitalize="none" />
        </Field>
        <Field label={isNew ? 'Password' : 'New password (leave empty to keep)'} hint="At least 8 characters">
          <input className="input" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} required={isNew} minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)} disabled={isSelf}>
            {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
        {form.role === 'housekeeping' && (
          <Field label="Floors they clean" hint="e.g. 1,2. Rooms on these floors are given to them automatically.">
            <input className="input" value={form.floors} onChange={(e) => set('floors', e.target.value)} maxLength={100} />
          </Field>
        )}
        {!isNew && !isSelf && (
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Account active (untick when someone leaves)</label>
        )}
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg">Save</button>
      </form>
    </Modal>
  );
}
