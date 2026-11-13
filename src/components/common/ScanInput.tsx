import { Camera, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/**
 * Barcode entry that works three ways:
 *  1. USB scanner – scanners act as a keyboard that types the code and presses Enter, so we just
 *     keep this input focused and submit on Enter.
 *  2. Camera – html5-qrcode (loaded on demand) where the browser/device allows it (needs HTTPS or localhost).
 *  3. Manual typing – same input, always available as the fallback.
 */
export function ScanInput({ onScan, placeholder = 'Scan or type barcode / item code, press Enter', autoFocus = true, disabled, busy }: {
  onScan: (code: string) => void | Promise<void>
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  busy?: boolean
}) {
  const [v, setV] = useState('')
  const [cam, setCam] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  const submit = async (code: string) => {
    const c = code.trim()
    if (!c) return
    setV('')
    await onScan(c)
    ref.current?.focus()
  }
  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-gold-600" aria-hidden />
          <input ref={ref} aria-label="Scan barcode" disabled={disabled || busy} value={v} placeholder={placeholder} autoComplete="off" spellCheck={false}
            onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(v) } }}
            className="h-10 w-full rounded-md border-2 border-gold-300 bg-gold-50/40 pr-3 pl-9 font-mono text-[14px] focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none" />
        </div>
        <Button size="lg" className="h-10" icon={<Camera size={16} />} onClick={() => setCam(true)} disabled={disabled} aria-label="Scan with camera">Camera</Button>
      </div>
      {cam && <CameraDialog onClose={() => setCam(false)} onCode={(c) => { setCam(false); submit(c) }} />}
    </>
  )
}

function CameraDialog({ onClose, onCode }: { onClose: () => void; onCode: (c: string) => void }) {
  const [err, setErr] = useState('')
  useEffect(() => {
    let stop: (() => Promise<void>) | null = null
    let cancelled = false
    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode('cam-region')
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 120 } }, (text) => { if (!cancelled) onCode(text) }, () => {})
        stop = async () => { try { await scanner.stop(); scanner.clear() } catch { /* ignore */ } }
        if (cancelled) await stop()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Camera not available. Use the keyboard/USB scanner or type the code.')
      }
    })()
    return () => { cancelled = true; stop?.() }
  }, [onCode])
  return (
    <Modal open onClose={onClose} title="Scan with camera" description="Hold the barcode inside the frame." size="sm" footer={<Button onClick={onClose}>Close</Button>}>
      <div id="cam-region" className="min-h-[200px] overflow-hidden rounded-md bg-black/5" />
      {err && <p role="alert" className="mt-2 text-[12.5px] text-bad">{err}</p>}
      <p className="mt-2 text-[11.5px] text-muted">Camera scanning needs HTTPS (GitHub Pages is HTTPS) or localhost, and camera permission.</p>
    </Modal>
  )
}
