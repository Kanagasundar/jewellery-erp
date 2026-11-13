import { Database, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Notice, Spinner } from '@/components/ui/Feedback'
import { Bare, Input, Select } from '@/components/ui/Form'
import { Card, PageHeader, Tabs } from '@/components/ui/Layout'
import { useConfirm } from '@/components/ui/Modal'
import { IS_DEMO } from '@/config/env'
import { useAction, useList, useMasters, useSettings } from '@/hooks/useData'
import { LABEL_SIZES } from '@/features/barcodes/LabelSheet'
import { erp } from '@/services'
import type { LabelSizeKey, Settings } from '@/types/entities'
import { fmtDateTime, fmtNum } from '@/utils/format'

function Profile() {
  const s = useSettings()
  const [f, setF] = useState<Settings | null>(null)
  useEffect(() => { if (s.data) setF(s.data) }, [s.data])
  const save = useAction((v: Settings) => erp.commands.system.saveSettings(v), { success: 'Settings saved' })
  if (!f) return <Spinner />
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v })
  return (
    <Card title="Shop profile & preferences">
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <Input label="Shop name" value={f.shopName} onChange={(e) => set('shopName', e.target.value)} /><Input label="Tagline" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} />
        <Input label="Address" wrapperClassName="sm:col-span-2" value={f.address} onChange={(e) => set('address', e.target.value)} /><Input label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="GSTIN" value={f.gstin} onChange={(e) => set('gstin', e.target.value)} hint="Shown on invoices." /><Input label="Invoice prefix" value={f.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <Input label="Default GST % (when a product has none)" type="number" step="0.01" value={f.defaultGstPercent} onChange={(e) => set('defaultGstPercent', Number(e.target.value))} />
        <Select label="Default label size" value={f.labelSize} onChange={(e) => set('labelSize', e.target.value as LabelSizeKey)}>{Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Input label="Audit weight tolerance (g)" type="number" step="0.001" value={f.weightTolerance} onChange={(e) => set('weightTolerance', Number(e.target.value))} hint="Variances at or below this are ignored in stock checks." />
        <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" className="accent-[#8f6d2f]" checked={f.showPriceOnLabel} onChange={(e) => set('showPriceOnLabel', e.target.checked)} />Print indicative price on labels</label>
      </div>
      <div className="mt-3 max-w-3xl"><Notice tone="blue">Stock is tracked per physical piece, so stock can never go negative — there is no “allow negative stock” switch.</Notice></div>
      <Button variant="primary" className="mt-4" loading={save.pending} onClick={() => save.run(f)}>Save settings</Button>
    </Card>
  )
}

function Branches() {
  const s = useSettings()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null)
  const list = s.data?.branches ?? []
  const save = useAction((branches: Settings['branches']) => erp.commands.system.saveSettings({ ...s.data!, branches }), { success: 'Branches updated' })
  if (!s.data) return <Spinner />
  const dup = (n: string, skip?: string) => list.some((b) => b.id !== skip && b.name.trim().toLowerCase() === n.trim().toLowerCase())
  return (
    <Card title="Branches / shops">
      <p className="mb-3 max-w-2xl text-[12.5px] text-muted">Each sale is stamped with the branch selected in the header and shows it on the invoice and sales list. Renaming a branch does not change invoices already issued (they keep the name at the time).</p>
      <ul className="mb-4 max-w-xl divide-y divide-line rounded-md border border-line">
        {list.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
            {edit?.id === b.id ? (
              <>
                <Bare.input aria-label="Branch name" autoFocus value={edit.name} onChange={(e) => setEdit({ id: b.id, name: e.target.value })} />
                <span className="flex gap-1"><Button size="sm" variant="primary" disabled={!edit.name.trim() || dup(edit.name, b.id)} loading={save.pending} onClick={async () => { await save.run(list.map((x) => (x.id === b.id ? { ...x, name: edit.name.trim() } : x))); setEdit(null) }}>Save</Button><Button size="sm" onClick={() => setEdit(null)}>Cancel</Button></span>
              </>
            ) : (
              <>
                <span className="text-[13.5px] font-medium">{b.name}</span>
                <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit({ id: b.id, name: b.name })}>Rename</Button>
                  <Button size="sm" variant="ghost" disabled={list.length <= 1} title={list.length <= 1 ? 'At least one branch is required' : undefined} onClick={async () => { if (await confirm({ title: `Remove “${b.name}”?`, message: 'Existing invoices keep the branch name they were issued with.', confirmLabel: 'Remove', danger: true })) save.run(list.filter((x) => x.id !== b.id)) }}><Trash2 size={13} /></Button></span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex max-w-xl gap-2">
        <Bare.input aria-label="New branch name" placeholder="New branch name, e.g. T. Nagar Showroom" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !dup(name)) { save.run([...list, { id: `br-${Date.now().toString(36)}`, name: name.trim() }]); setName('') } }} />
        <Button variant="primary" icon={<Plus size={14} />} disabled={!name.trim() || dup(name)} loading={save.pending} onClick={async () => { await save.run([...list, { id: `br-${Date.now().toString(36)}`, name: name.trim() }]); setName('') }}>Add branch</Button>
      </div>
      {name.trim() && dup(name) && <p role="alert" className="mt-1 text-[11.5px] text-bad">A branch with this name already exists.</p>}
    </Card>
  )
}

function Rates() {
  const m = useMasters()
  const rates = useList('metalRates')
  const confirm = useConfirm()
  const [f, setF] = useState({ purityId: '', rate: '' })
  const add = useAction(() => { const p = m.purityMap.get(f.purityId)!; return erp.repos.metalRates.create({ metalId: p.metalId, purityId: p.id, ratePerGram: Number(f.rate), effectiveAt: new Date().toISOString() }) }, { success: 'New rate published. Existing invoices keep their original rate.', onSuccess: () => setF({ ...f, rate: '' }) })
  const del = useAction((id: string) => erp.repos.metalRates.remove(id), { success: 'Rate removed' })
  const latest = (pid: string) => (rates.data ?? []).filter((r) => r.purityId === pid).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card title="Publish today’s rate">
        <div className="space-y-3"><Select label="Metal / purity" value={f.purityId} onChange={(e) => setF({ ...f, purityId: e.target.value })}><option value="">Select…</option>{(m.purities.data ?? []).map((p) => <option key={p.id} value={p.id}>{m.metalMap.get(p.metalId)?.name} {p.label}{latest(p.id) ? ` — now ₹${fmtNum(latest(p.id).ratePerGram)}` : ''}</option>)}</Select>
          <Input label="Rate per gram (₹)" type="number" step="0.01" min="0" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          <Button variant="primary" disabled={!f.purityId || !(Number(f.rate) > 0)} loading={add.pending} icon={<Plus size={14} />} onClick={() => add.run()}>Publish rate</Button>
          <p className="text-[11.5px] text-muted">Rates are history, not edits: each publish adds a dated entry. Completed invoices always keep the rate they were issued with.</p></div>
      </Card>
      <DataTable rows={rates.data} rowKey={(r) => r.id} loading={rates.isLoading} initialSort={{ key: 'at', dir: 'desc' }} pageSizes={[10, 25, 50]} columns={[
        { key: 'at', header: 'Effective from', value: (r) => r.effectiveAt, render: (r) => fmtDateTime(r.effectiveAt) },
        { key: 'm', header: 'Metal / purity', value: (r) => `${m.metalMap.get(r.metalId)?.name} ${m.purityMap.get(r.purityId)?.label}` },
        { key: 'r', header: 'Rate ₹/g', num: true, value: (r) => r.ratePerGram, render: (r) => fmtNum(r.ratePerGram) },
        { key: 'x', header: '', render: (r) => <button aria-label="Remove rate" className="rounded p-1 text-faint hover:text-bad" onClick={async () => { if (await confirm({ title: 'Remove this rate entry?', message: 'Invoices already issued are unaffected (they store their own rate).', danger: true, confirmLabel: 'Remove' })) del.run(r.id) }}><Trash2 size={14} /></button> },
      ]} />
    </div>
  )
}

function Masters() {
  const m = useMasters()
  const taxes = useList('taxConfigs')
  const [cat, setCat] = useState({ name: '', subs: '' })
  const [pur, setPur] = useState({ metalId: '', label: '', fineness: '' })
  const [metal, setMetal] = useState('')
  const [tax, setTax] = useState({ name: '', percent: '' })
  const addCat = useAction(() => erp.repos.categories.create({ name: cat.name.trim(), code: cat.name.trim().slice(0, 4).toUpperCase(), subcategories: cat.subs.split(',').map((x) => x.trim()).filter(Boolean) }), { success: 'Category added', onSuccess: () => setCat({ name: '', subs: '' }) })
  const addMetal = useAction(() => erp.repos.metals.create({ name: metal.trim(), code: metal.trim().slice(0, 3).toUpperCase() }), { success: 'Metal added', onSuccess: () => setMetal('') })
  const addPur = useAction(() => erp.repos.purities.create({ metalId: pur.metalId, label: pur.label.trim(), fineness: Number(pur.fineness) }), { success: 'Purity added', onSuccess: () => setPur({ ...pur, label: '', fineness: '' }) })
  const addTax = useAction(() => erp.repos.taxConfigs.create({ name: tax.name.trim(), percent: Number(tax.percent) }), { success: 'Tax rate added', onSuccess: () => setTax({ name: '', percent: '' }) })
  const del = { cat: useAction((id: string) => erp.repos.categories.remove(id), { success: 'Removed' }), pur: useAction((id: string) => erp.repos.purities.remove(id), { success: 'Removed' }), metal: useAction((id: string) => erp.repos.metals.remove(id), { success: 'Removed' }), tax: useAction((id: string) => erp.repos.taxConfigs.remove(id), { success: 'Removed' }) }
  const X = ({ onClick, label }: { onClick: () => void; label: string }) => <button aria-label={label} onClick={onClick} className="rounded p-1 text-faint hover:text-bad"><Trash2 size={13} /></button>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Categories & subcategories">
        <ul className="mb-3 divide-y divide-line text-[13px]">{(m.categories.data ?? []).map((c) => <li key={c.id} className="flex items-start justify-between gap-2 py-1.5"><span><strong>{c.name}</strong><span className="block text-[11.5px] text-muted">{c.subcategories.join(', ') || '—'}</span></span><X label={`Delete ${c.name}`} onClick={() => del.cat.run(c.id)} /></li>)}</ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"><Bare.input aria-label="Category name" placeholder="Category" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} /><Bare.input aria-label="Subcategories" placeholder="Subcategories, comma separated" value={cat.subs} onChange={(e) => setCat({ ...cat, subs: e.target.value })} /><Button size="sm" disabled={!cat.name.trim()} loading={addCat.pending} onClick={() => addCat.run()}>Add</Button></div>
      </Card>
      <div className="space-y-4">
        <Card title="Metals">
          <div className="mb-3 flex flex-wrap gap-2">{(m.metals.data ?? []).map((x) => <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2.5 py-1 text-[12.5px]">{x.name}<X label={`Delete ${x.name}`} onClick={() => del.metal.run(x.id)} /></span>)}</div>
          <div className="flex gap-2"><Bare.input aria-label="Metal name" placeholder="e.g. Platinum" value={metal} onChange={(e) => setMetal(e.target.value)} /><Button size="sm" disabled={!metal.trim()} loading={addMetal.pending} onClick={() => addMetal.run()}>Add</Button></div>
        </Card>
        <Card title="Purities">
          <ul className="mb-3 grid gap-1 text-[13px] sm:grid-cols-2">{(m.purities.data ?? []).map((p) => <li key={p.id} className="flex items-center justify-between rounded bg-canvas px-2.5 py-1">{m.metalMap.get(p.metalId)?.name} {p.label} <span className="text-muted">({p.fineness})</span><X label={`Delete ${p.label}`} onClick={() => del.pur.run(p.id)} /></li>)}</ul>
          <div className="grid grid-cols-[1fr_1fr_90px_auto] gap-2"><Bare.select aria-label="Metal" value={pur.metalId} onChange={(e) => setPur({ ...pur, metalId: e.target.value })}><option value="">Metal…</option>{(m.metals.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Bare.select><Bare.input aria-label="Purity label" placeholder="e.g. 14K" value={pur.label} onChange={(e) => setPur({ ...pur, label: e.target.value })} /><Bare.input aria-label="Fineness" type="number" placeholder="585" value={pur.fineness} onChange={(e) => setPur({ ...pur, fineness: e.target.value })} /><Button size="sm" disabled={!pur.metalId || !pur.label.trim() || !(Number(pur.fineness) > 0)} loading={addPur.pending} onClick={() => addPur.run()}>Add</Button></div>
        </Card>
        <Card title="Tax configuration (GST)">
          <ul className="mb-3 divide-y divide-line text-[13px]">{(taxes.data ?? []).map((t) => <li key={t.id} className="flex items-center justify-between py-1.5">{t.name}<span className="flex items-center gap-2"><strong>{t.percent}%</strong><X label={`Delete ${t.name}`} onClick={() => del.tax.run(t.id)} /></span></li>)}</ul>
          <div className="flex gap-2"><Bare.input aria-label="Tax name" placeholder="Name" value={tax.name} onChange={(e) => setTax({ ...tax, name: e.target.value })} /><Bare.input aria-label="Tax percent" type="number" step="0.01" placeholder="%" className="w-24" value={tax.percent} onChange={(e) => setTax({ ...tax, percent: e.target.value })} /><Button size="sm" disabled={!tax.name.trim() || tax.percent === ''} loading={addTax.pending} onClick={() => addTax.run()}>Add</Button></div>
          <p className="mt-2 text-[11.5px] text-muted">GST % is set per product (Products → pricing). Invoices store the % used at the time of sale.</p>
        </Card>
      </div>
    </div>
  )
}

function DemoData() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const reset = useAction(() => erp.commands.system.resetDemo(), { success: 'Demo data restored to the original sample set', onSuccess: () => setTimeout(() => location.reload(), 600) })
  const logs = useList('auditLogs')
  return (
    <div className="space-y-4">
      <Card title="Demo data">
        {IS_DEMO ? <>
          <p className="mb-3 max-w-2xl text-[13px] text-ink-2">All data lives in this browser (IndexedDB) and persists across refreshes. It is not shared with other devices or users. Resetting deletes everything you created and reloads the sample set.</p>
          <Button variant="danger" icon={<RotateCcw size={14} />} disabled={!can('demo.reset')} loading={reset.pending} onClick={async () => { if (await confirm({ title: 'Reset all demo data?', message: 'Every record you created or changed will be lost.', confirmLabel: 'Reset demo data', danger: true })) reset.run() }}>Reset demo data</Button></>
          : <Notice tone="blue">Production mode — data is stored on the server. Demo reset is disabled.</Notice>}
      </Card>
      <Card title={<span className="flex items-center gap-2"><Database size={14} />Audit trail</span>} pad={false}>
        <DataTable rows={logs.data} rowKey={(l) => l.id} loading={logs.isLoading} initialSort={{ key: 'at', dir: 'desc' }} pageSizes={[25, 50, 100]} columns={[
          { key: 'at', header: 'When', value: (l) => l.at, render: (l) => fmtDateTime(l.at) }, { key: 'u', header: 'User', value: (l) => l.userName }, { key: 'a', header: 'Action', value: (l) => `${l.action} ${l.entity}` },
          { key: 'd', header: 'Details', value: (l) => l.details, render: (l) => <span className="text-muted">{l.details}</span> }]} />
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')
  return (
    <div className="fade-in">
      <PageHeader title="Settings" subtitle="Shop profile, metal rates, masters and system tools." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'profile', label: 'Shop & preferences' }, { key: 'branches', label: 'Branches' }, { key: 'rates', label: 'Metal rates' }, { key: 'masters', label: 'Categories, metals, purities, tax' }, { key: 'system', label: 'Demo data & audit trail' }]} />
      {tab === 'profile' && <Profile />}{tab === 'branches' && <Branches />}{tab === 'rates' && <Rates />}{tab === 'masters' && <Masters />}{tab === 'system' && <DemoData />}
    </div>
  )
}
