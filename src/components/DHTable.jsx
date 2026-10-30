import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PARAM_COLORS } from './Robot.jsx'

/**
 * Number field that keeps what the user types ("-", "0.") and commits only valid numbers.
 * Mouse wheel over the field steps the value by `step` (Shift: ÷10, Ctrl/Alt: ×10).
 */
export function NumField({ value, onCommit, step = 0.01, className = '', ...props }) {
  const [text, setText] = useState(String(value))
  const input = useRef(null)
  const latest = useRef({ value, onCommit, step })
  latest.current = { value, onCommit, step }
  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  useEffect(() => {
    const el = input.current
    // Native listener: React's onWheel is passive and cannot stop the page from scrolling.
    const wheel = (e) => {
      if (el.disabled || e.deltaY === 0) return
      e.preventDefault()
      const { value, onCommit, step } = latest.current
      const k = e.shiftKey ? 0.1 : e.ctrlKey || e.altKey ? 10 : 1
      const inc = step * k
      // Keep the value's own digits (0.455 → 0.465), only drop floating point noise.
      const next = Number((value + (e.deltaY < 0 ? inc : -inc)).toFixed(6))
      setText(String(next))
      onCommit(next)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  return (
    <Input
      ref={input}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.')
        setText(t)
        const v = Number(t)
        if (t.trim() !== '' && Number.isFinite(v)) onCommit(v)
      }}
      onBlur={() => setText(String(value))}
      onFocus={(e) => e.target.select()}
      className={`h-7 px-1.5 text-right font-mono text-xs tabular-nums md:text-xs ${className}`}
      {...props}
      title={`${props.title ? `${props.title} · ` : ''}Tekerlek ±${step} (Shift ÷10, Ctrl ×10)`}
    />
  )
}

/**
 * Editable DH table. The column headings change with the convention:
 * modified DH rows carry α_{i-1}, a_{i-1} of the previous link.
 */
export default function DHTable({ rows, convention, selected, onSelect, onChange, onAdd, onRemove }) {
  const mod = convention === 'modified'
  const head = [
    ['θ', 'theta', '°', 'θᵢ: zᵢ₋₁ etrafında xᵢ₋₁ → xᵢ dönüşü (döner eklemde ofset)'],
    ['d', 'd', 'm', 'dᵢ: z boyunca kayma (prizmatik eklemde ofset)'],
    [mod ? 'a₋₁' : 'a', 'a', 'm', mod ? 'aᵢ₋₁: xᵢ₋₁ boyunca zᵢ₋₁ ile zᵢ arası' : 'aᵢ: xᵢ boyunca zᵢ₋₁ ile zᵢ arası'],
    [mod ? 'α₋₁' : 'α', 'alpha', '°', mod ? 'αᵢ₋₁: xᵢ₋₁ etrafında zᵢ₋₁ → zᵢ' : 'αᵢ: xᵢ etrafında zᵢ₋₁ → zᵢ'],
  ]
  const order = mod ? [3, 2, 0, 1] : [0, 1, 2, 3]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[1.4rem_2rem_repeat(4,1fr)_1.75rem] items-center gap-1 text-[11px] text-muted-foreground">
        <span>#</span>
        <span title="R: döner, P: prizmatik">tip</span>
        {order.map((k) => (
          <span key={k} className="text-right font-medium" style={{ color: PARAM_COLORS[head[k][1]] }} title={head[k][3]}>
            {head[k][0]} <span className="text-muted-foreground">{head[k][2]}</span>
          </span>
        ))}
        <span />
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          onFocusCapture={() => onSelect(i)}
          onClick={() => onSelect(i)}
          className={`grid grid-cols-[1.4rem_2rem_repeat(4,1fr)_1.75rem] items-center gap-1 rounded-md px-0.5 py-0.5 ${selected === i ? 'bg-accent/50 ring-1 ring-primary/50' : ''}`}
        >
          <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-0 font-mono text-xs"
            title="Döner (R) / prizmatik (P) eklem"
            onClick={() => onChange(i, { type: row.type === 'R' ? 'P' : 'R' })}
          >
            {row.type}
          </Button>
          {order.map((k) => {
            const key = head[k][1]
            const variable = (key === 'theta' && row.type === 'R') || (key === 'd' && row.type === 'P')
            return (
              <NumField
                key={key}
                step={key === 'theta' || key === 'alpha' ? 1 : 0.01}
                value={row[key]}
                onCommit={(v) => onChange(i, { [key]: v })}
                aria-label={`${head[k][0]} satır ${i + 1}`}
                title={variable ? 'Eklem değişkeni bu değere eklenir (ofset)' : head[k][3]}
                className={variable ? 'border-primary/50' : ''}
              />
            )
          })}
          <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => onRemove(i)} disabled={rows.length <= 1} aria-label={`Satır ${i + 1} sil`}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => onAdd('R')} disabled={rows.length >= 12}>
          <Plus /> Döner eklem
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd('P')} disabled={rows.length >= 12}>
          <Plus /> Prizmatik eklem
        </Button>
      </div>
    </div>
  )
}
