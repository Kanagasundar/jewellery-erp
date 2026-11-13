import clsx from 'clsx'
import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const control =
  'w-full rounded-md border border-line-strong bg-white px-2.5 text-[13px] text-ink placeholder:text-faint ' +
  'focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200 disabled:bg-canvas disabled:text-muted'

interface FieldProps {
  label: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: (id: string) => ReactNode
}
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId()
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        {label}
        {required && <span className="text-bad"> *</span>}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-[11.5px] text-bad">{error}</p>
      ) : hint ? (
        <p className="text-[11.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; wrapperClassName?: string }
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, required, wrapperClassName, className, ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => <input id={id} ref={ref} required={false} aria-required={required} aria-invalid={!!error} className={clsx(control, 'h-9', error && 'border-bad', className)} {...rest} />}
    </Field>
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; wrapperClassName?: string }
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, required, wrapperClassName, className, children, ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => <select id={id} ref={ref} aria-invalid={!!error} className={clsx(control, 'h-9 pr-7', error && 'border-bad', className)} {...rest}>{children}</select>}
    </Field>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string; wrapperClassName?: string }
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, error, hint, required, wrapperClassName, className, ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => <textarea id={id} ref={ref} rows={3} aria-invalid={!!error} className={clsx(control, 'py-2', error && 'border-bad', className)} {...rest} />}
    </Field>
  )
})

/** Bare control (no label) for dense table cells and toolbars. Always pass aria-label. */
export const Bare = {
  input: forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function BareInput({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx(control, 'h-8 text-[12.5px]', className)} {...rest} />
  }),
  select: forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function BareSelect({ className, children, ...rest }, ref) {
    return <select ref={ref} className={clsx(control, 'h-8 pr-6 text-[12.5px]', className)} {...rest}>{children}</select>
  }),
}

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
      <input type="checkbox" className="h-4 w-4 rounded border-line-strong accent-[#8f6d2f]" {...rest} />
      {label}
    </label>
  )
}
