import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, Notice } from '@/components/ui/Feedback'
import { Input, Select, Checkbox } from '@/components/ui/Form'
import { Card, PageHeader, Tabs } from '@/components/ui/Layout'
import { Modal } from '@/components/ui/Modal'
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from '@/domain/permissions'
import { useAction, useList } from '@/hooks/useData'
import { erp } from '@/services'
import type { RoleKey, User } from '@/types/entities'

const ROLES = Object.keys(ROLE_LABELS) as RoleKey[]

function UserForm({ open, onClose, user }: { open: boolean; onClose: () => void; user?: User }) {
  const [f, setF] = useState({ name: user?.name ?? '', email: user?.email ?? '', role: (user?.role ?? 'sales') as RoleKey, active: user?.active ?? true })
  const [touched, setTouched] = useState(false)
  const bad = !f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email)
  const save = useAction(() => (user ? erp.repos.users.update(user.id, { ...f, isArtisan: f.role === 'artisan' }) : erp.repos.users.create({ ...f, isArtisan: f.role === 'artisan' })), { success: 'User saved', onSuccess: onClose })
  return (
    <Modal open={open} onClose={onClose} size="sm" title={user ? 'Edit user' : 'New user'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={() => { setTouched(true); if (!bad) save.run() }}>Save</Button></>}>
      <div className="space-y-3">
        <Input label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={touched && !f.name.trim() ? 'Required' : undefined} />
        <Input label="Email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={touched && !/^\S+@\S+\.\S+$/.test(f.email) ? 'Enter a valid email' : undefined} />
        <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as RoleKey })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
        <Checkbox label="Active" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <Notice tone="amber">Demo mode: users are not authenticated by password. In production, credentials and roles are managed and enforced by the server.</Notice>
      </div>
    </Modal>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const users = useList('users')
  const [tab, setTab] = useState('users')
  const [edit, setEdit] = useState<User | undefined>()
  const [open, setOpen] = useState(false)
  const cols: Column<User>[] = [
    { key: 'name', header: 'Name', value: (u) => u.name, render: (u) => <span className="font-medium">{u.name}{u.id === me?.id && <span className="ml-1.5 text-[11px] text-gold-600">(you)</span>}</span> },
    { key: 'email', header: 'Email', value: (u) => u.email },
    { key: 'role', header: 'Role', value: (u) => ROLE_LABELS[u.role], render: (u) => <Badge tone="gold">{ROLE_LABELS[u.role]}</Badge> },
    { key: 'active', header: 'Status', value: (u) => (u.active ? 'Active' : 'Inactive'), render: (u) => <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'e', header: '', render: (u) => <Button size="sm" variant="ghost" onClick={() => { setEdit(u); setOpen(true) }}>Edit</Button> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Users & permissions" subtitle="Who can do what. Role rules are enforced in the command layer (demo) and must be enforced by the API (production)."
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => { setEdit(undefined); setOpen(true) }}>New user</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Users', count: users.data?.length }, { key: 'matrix', label: 'Role permission matrix' }]} />
      {tab === 'users' ? <DataTable rows={users.data} columns={cols} rowKey={(u) => u.id} loading={users.isLoading} error={users.error} />
        : (
          <Card pad={false}><div className="overflow-auto"><table className="grid-table"><thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABELS[r]}</th>)}</tr></thead>
            <tbody>{PERMISSIONS.map((p) => <tr key={p}><td className="font-mono text-[12px]">{p}</td>{ROLES.map((r) => <td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? <span className="text-ok" aria-label="Allowed">●</span> : <span className="text-line-strong" aria-label="Denied">·</span>}</td>)}</tr>)}</tbody></table></div></Card>
        )}
      {open && <UserForm key={edit?.id ?? 'new'} open onClose={() => setOpen(false)} user={edit} />}
    </div>
  )
}
