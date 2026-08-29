import type { ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}{hint ? ` · ${hint}` : ''}</span>
      {children}
    </label>
  );
}

export function Block({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="block">
      <h3>{title}</h3>
      {help && <p className="help">{help}</p>}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  values, options, onToggle,
}: { values: T[]; options: { value: T; label: string }[]; onToggle: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={values.includes(o.value)}
          onClick={() => onToggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Scale({
  value, min = 1, max = 5, low, high, onChange,
}: { value: number; min?: number; max?: number; low: string; high: string; onChange: (v: number) => void }) {
  return (
    <>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="scale-labels"><span>{low}</span><span>{high}</span></div>
    </>
  );
}
