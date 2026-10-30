import { Pause, Play, RotateCcw, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { PIVOT_STEPS } from '@/kinematics/pivot.js'
import { NumField } from './DHTable.jsx'

function Field({ label, unit, children }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      <span>
        {label} <span className="opacity-70">{unit}</span>
      </span>
      {children}
    </label>
  )
}

/**
 * Tool settings and the TCP rotation program: the tool tip stays fixed in space
 * while the robot tilts, circles and spins the tool around it.
 */
export default function ToolPanel({ tool, setTool, pivot, onPlay, onStop, canPivot }) {
  const set = (patch) => setTool((t) => ({ ...t, ...patch }))
  const playing = pivot.playing
  const progress = pivot.t / PIVOT_STEPS.length
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        variant="outline"
        size="sm"
        pressed={tool.on}
        onPressedChange={(v) => set({ on: v })}
        disabled={playing}
        className="justify-start text-xs text-muted-foreground data-[state=on]:border-primary/60 data-[state=on]:bg-transparent data-[state=on]:text-foreground"
      >
        <Wrench className={tool.on ? 'text-primary' : ''} /> Tool takılı: {tool.on ? 'evet' : 'hayır'}
      </Toggle>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Uzunluk" unit="mm">
          <NumField value={Math.round(tool.length * 1000)} step={1} onCommit={(v) => v >= 0 && v <= 600 && set({ length: v / 1000 })} disabled={playing} aria-label="Tool uzunluğu (mm)" />
        </Field>
        <Field label="Çap" unit="mm">
          <NumField value={Math.round(tool.diameter * 1000)} step={1} onCommit={(v) => v >= 2 && v <= 200 && set({ diameter: v / 1000 })} disabled={playing} aria-label="Tool çapı (mm)" />
        </Field>
        <Field label="Eğim açısı" unit="°">
          <NumField value={tool.tilt} step={1} onCommit={(v) => v >= 0 && v <= 60 && set({ tilt: v })} aria-label="Eğim açısı" />
        </Field>
        <Field label="Dönme açısı" unit="°">
          <NumField value={tool.spin} step={5} onCommit={(v) => v >= 0 && v <= 180 && set({ spin: v })} aria-label="Tool ekseni etrafında dönme açısı" />
        </Field>
      </div>
      <label className="flex flex-col gap-2 text-[11px] text-muted-foreground">
        <span className="flex justify-between">
          Hız <span className="font-mono text-foreground tabular-nums">{tool.speed.toFixed(1)}×</span>
        </span>
        <Slider min={0.2} max={3} step={0.1} value={[tool.speed]} onValueChange={([v]) => set({ speed: v })} aria-label="Hız" />
      </label>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        {playing ? (
          <Button size="lg" variant="destructive" onClick={() => onStop(false)}>
            <Pause /> Durdur
          </Button>
        ) : (
          <Button size="lg" onClick={onPlay} disabled={!canPivot}>
            <Play /> TCP etrafında döndür
          </Button>
        )}
        <Button size="lg" variant="outline" onClick={() => onStop(true)} disabled={!pivot.start} aria-label="Başa dön" title="Başlangıç duruşuna dön">
          <RotateCcw />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
        </div>
        <ol className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {PIVOT_STEPS.map((s, i) => (
            <li key={s.id} className={playing && pivot.step === i ? 'font-medium text-primary' : pivot.t > i + 1 ? 'text-foreground' : 'text-muted-foreground'}>
              {i + 1}. {s.name}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <span className="text-muted-foreground">TCP sapması</span>
          <span className={`float-right ${pivot.drift > 1 ? 'text-destructive' : ''}`}>{pivot.start ? `${pivot.drift.toFixed(2)} mm` : '–'}</span>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <span className="text-muted-foreground">en fazla</span>
          <span className={`float-right ${pivot.maxDrift > 1 ? 'text-destructive' : ''}`}>{pivot.start ? `${pivot.maxDrift.toFixed(2)} mm` : '–'}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tool ucu (TCP) uzayda sabit kalır; robot tool'u o nokta etrafında eğer, koni çizdirir ve kendi ekseninde döndürür. Uç sapması canlı ölçülür.
        {!canPivot && <span className="text-destructive"> Bunun için 6 eksenli robot ve takılı tool gerekir.</span>}
      </p>
    </div>
  )
}
