import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Bare, Input, Select } from '@/components/ui/Form'
import { PageHeader, Stat } from '@/components/ui/Layout'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { money, sum } from '@/domain/calculations/decimal'
import { useAction, useList } from '@/hooks/useData'
import { erp } from '@/services'
import type { Expense } from '@/types/entities'
import { inRange, monthKey } from '@/utils/dates'
import { fmtDate, fmtMoney, fmtNum, todayInput } from '@/utils/format'

export const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Marketing', 'Packaging', 'Insurance', 'Repairs & Maintenance', 'Transport', 'Professional fees', 'Miscellaneous']
const schema = z.object({
  date: z.string().min(1, 'Date is required'),
  category: z.string().min(1, 'Choose a category'),
  amount: z.number({ error: 'Enter an amount' }).positive('Amount must be greater than zero'),
  mode: z.enum(['cash', 'upi', 'card', 'bank']),
  paidTo: z.string().trim().min(2, 'Who was paid?'),
  notes: z.string(),
})
type FV = z.infer<typeof schema>

function ExpenseForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FV>({ resolver: zodResolver(schema) as Resolver<FV>, defaultValues: { date: todayInput(), category: '', mode: 'cash', paidTo: '', notes: '' } })
  const save = useAction((v: FV) => erp.repos.expenses.create({ ...v, date: new Date(v.date + 'T12:00:00').toISOString() } as Omit<Expense, 'id'>), {
    success: (e) => `${e.expenseNo} recorded`, onSuccess: () => { reset({ date: todayInput(), category: '', mode: 'cash', paidTo: '', notes: '' } as unknown as FV); onClose() },
  })
  return (
    <Modal open={open} onClose={onClose} title="Record expense" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={handleSubmit((v) => save.run(v))}>Save expense</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <Input label="Date" type="date" max={todayInput()} required {...register('date')} error={errors.date?.message} />
        <Select label="Category" required {...register('category')} error={errors.category?.message}><option value="">Select…</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        <Input label="Amount (₹)" type="number" step="0.01" required {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <Select label="Paid via" {...register('mode')}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></Select>
        <Input label="Paid to" required wrapperClassName="sm:col-span-2" {...register('paidTo')} error={errors.paidTo?.message} />
        <Input label="Notes" wrapperClassName="sm:col-span-2" {...register('notes')} />
      </form>
    </Modal>
  )
}

export default function ExpensesPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const exp = useList('expenses')
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [cat, setCat] = useState('')
  const rows = useMemo(() => (exp.data ?? []).filter((e) => inRange(e.date, from, to) && (!cat || e.category === cat)), [exp.data, from, to, cat])
  const del = useAction((id: string) => erp.repos.expenses.remove(id), { success: 'Expense removed' })
  const month = monthKey(new Date())
  const byCat = useMemo(() => { const m = new Map<string, number>(); for (const e of rows) m.set(e.category, money((m.get(e.category) ?? 0) + e.amount)); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3) }, [rows])
  const cols: Column<Expense>[] = [
    { key: 'no', header: 'No.', value: (e) => e.expenseNo, render: (e) => <span className="font-mono text-[12px]">{e.expenseNo}</span> },
    { key: 'date', header: 'Date', value: (e) => e.date, render: (e) => fmtDate(e.date) },
    { key: 'cat', header: 'Category', value: (e) => e.category },
    { key: 'to', header: 'Paid to', value: (e) => e.paidTo },
    { key: 'mode', header: 'Mode', value: (e) => e.mode, render: (e) => e.mode.toUpperCase() },
    { key: 'notes', header: 'Notes', value: (e) => e.notes ?? '', render: (e) => <span className="text-muted">{e.notes || '—'}</span> },
    { key: 'amt', header: 'Amount (₹)', num: true, value: (e) => e.amount, render: (e) => fmtNum(e.amount), footer: (r) => fmtNum(money(sum(r.map((x) => x.amount)))) },
    ...(can('expenses.manage') ? [{ key: 'x', header: '', render: (e: Expense) => <button aria-label={`Delete ${e.expenseNo}`} className="rounded p-1 text-faint hover:bg-bad-bg hover:text-bad" onClick={async (ev) => { ev.stopPropagation(); if (await confirm({ title: `Delete ${e.expenseNo}?`, message: 'This removes the expense from the books.', confirmLabel: 'Delete', danger: true })) del.run(e.id) }}><Trash2 size={14} /></button> }] : []),
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Expenses" subtitle="Shop running costs, kept separate from stock purchases."
        actions={can('expenses.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Record expense</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This month" value={fmtMoney(money(sum((exp.data ?? []).filter((e) => monthKey(e.date) === month).map((e) => e.amount))))} />
        <Stat label="In current filter" value={fmtMoney(money(sum(rows.map((e) => e.amount))))} sub={`${rows.length} entries`} />
        {byCat.map(([c, v]) => <Stat key={c} label={c} value={fmtMoney(v)} />)}
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(e) => e.id} loading={exp.isLoading} error={exp.error} initialSort={{ key: 'date', dir: 'desc' }} showFooter empty={{ title: 'No expenses recorded' }}
        toolbar={<><Bare.input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted">to</span><Bare.input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Bare.select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Bare.select></>} />
      <ExpenseForm open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
