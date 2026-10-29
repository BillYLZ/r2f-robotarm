import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  Axis3d, Bot, Box, Check, ChevronDown, ChevronUp, Crosshair, Dices, Eraser, Eye, Grid3x3, Home, Move3d, PanelLeft, Rotate3d, Ruler, Share2, Sparkles, Spline, Table2, Tag, SlidersHorizontal,
} from 'lucide-react'
import Scene from './components/Scene.jsx'
import DHTable, { NumField } from './components/DHTable.jsx'
import { clampJoint, defaultLimits, forward } from './kinematics/dh.js'
import { position, rpy } from './kinematics/mat4.js'
import { manipulability, solveIK } from './kinematics/ik.js'
import { newRow, presetById, PRESETS } from './kinematics/presets.js'
import { decodeRobot, encodeRobot } from './dhcode.js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const fromPreset = (p) => ({ presetId: p.id, rows: p.rows.map((r) => ({ ...r })), q: p.home.slice(), convention: p.convention, base: p.base })

function initialRobot() {
  const linked = typeof window !== 'undefined' && decodeRobot(window.location.hash)
  return linked ? { presetId: 'custom', ...linked } : fromPreset(PRESETS[0])
}

/** Rough reach of the arm, used to size the camera, joints and arrows. */
const reachOf = (rows) => Math.max(0.3, rows.reduce((s, r) => s + Math.abs(r.a) + Math.abs(r.d) + (r.type === 'P' ? Math.abs(r.max) : 0), 0))

const fmt = (v, n = 1) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toFixed(n)

function Toggler({ pressed, onChange, icon: Icon, children, title }) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={pressed}
      onPressedChange={onChange}
      title={title}
      className="justify-start text-xs text-muted-foreground data-[state=on]:border-primary/60 data-[state=on]:bg-transparent data-[state=on]:text-foreground"
    >
      <Icon className={pressed ? 'text-primary' : ''} /> {children}
    </Toggle>
  )
}

function JointSliders({ rows, q, selected, onSelect, onQ, onLimits }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => {
        const deg = row.type === 'R'
        return (
          <div key={i} className={`flex flex-col gap-1.5 rounded-md px-1 py-1 ${selected === i ? 'bg-accent/40' : ''}`} onPointerDown={() => onSelect(i)}>
            <div className="grid grid-cols-[2.6rem_1fr_4.5rem] items-center gap-2">
              <span className="text-xs text-muted-foreground">
                q{i + 1} <span className="text-[10px]">{deg ? 'θ' : 'd'}</span>
              </span>
              <Slider min={row.min} max={row.max} step={deg ? 0.5 : 0.001} value={[q[i]]} onValueChange={([v]) => onQ(i, v)} aria-label={`Eklem ${i + 1}`} />
              <NumField value={deg ? Math.round(q[i] * 10) / 10 : Math.round(q[i] * 1000) / 1000} onCommit={(v) => onQ(i, clampJoint(row, v))} aria-label={`Eklem ${i + 1} değeri`} />
            </div>
            {selected === i && (
              <div className="grid grid-cols-[2.6rem_1fr_1fr] items-center gap-2 text-[11px] text-muted-foreground">
                <span>limit</span>
                <NumField value={row.min} onCommit={(v) => v < row.max && onLimits(i, { min: v })} aria-label="Alt limit" />
                <NumField value={row.max} onCommit={(v) => v > row.min && onLimits(i, { max: v })} aria-label="Üst limit" />
              </div>
            )}
          </div>
        )
      })}
      <p className="text-[11px] text-muted-foreground">Döner eklemde derece, prizmatikte metre. Değer DH tablosundaki θ veya d ofsetine eklenir.</p>
    </div>
  )
}

function PosePanel({ fk, w, wRef, ikStatus, ikOn }) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768)
  const T = fk.tool
  const p = position(T)
  const [r, pi, y] = rpy(T).map((v) => (v * 180) / Math.PI)
  const singular = w < wRef * 0.02
  return (
    <div className="pointer-events-auto absolute top-3 right-3 z-30 w-[min(calc(100%-1.5rem),18rem)] rounded-xl border bg-card p-3 text-xs shadow-lg backdrop-blur md:top-4 md:right-4">
      <button type="button" className="flex w-full items-center justify-between font-medium" onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-1.5">
          <Crosshair className="size-4 text-primary" /> Uç nokta (T₀ⁿ)
        </span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      <div className="mt-2 grid grid-cols-3 gap-1 font-mono tabular-nums">
        {['X', 'Y', 'Z'].map((k, i) => (
          <div key={k} className="rounded-md bg-muted/50 px-1.5 py-1">
            <span className="text-muted-foreground">{k}</span> <span className="float-right">{fmt(p[i] * 1000)}</span>
          </div>
        ))}
        {open && [['R', r], ['P', pi], ['Y', y]].map(([k, v]) => (
          <div key={k} className="rounded-md bg-muted/50 px-1.5 py-1">
            <span className="text-muted-foreground">{k}</span> <span className="float-right">{fmt(v)}°</span>
          </div>
        ))}
      </div>
      {open && (
        <>
          <p className="mt-1 text-[10px] text-muted-foreground">mm · RPY = ZYX Euler (roll x, pitch y, yaw z)</p>
          <table className="mt-2 w-full font-mono text-[11px] tabular-nums">
            <tbody>
              {[0, 1, 2, 3].map((rI) => (
                <tr key={rI}>
                  {[0, 1, 2, 3].map((c) => (
                    <td key={c} className={`px-1 text-right ${c === 3 && rI < 3 ? 'text-primary' : rI === 3 ? 'text-muted-foreground' : ''}`}>
                      {fmt(T[rI * 4 + c], 3)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground" title="Yoshikawa manipülabilite: √det(J·Jᵀ). Tekillikte 0 olur.">
              manipülabilite w
            </span>
            <span className="font-mono tabular-nums">{w.toExponential(2)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {singular && <Badge variant="destructive">tekilliğe yakın</Badge>}
            {ikOn && ikStatus && (
              <Badge variant={ikStatus.ok ? 'secondary' : 'destructive'}>{ikStatus.ok ? 'IK: hedefe ulaştı' : `IK: ulaşamadı (${(ikStatus.error * 1000).toFixed(0)} mm)`}</Badge>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [robot, setRobot] = useState(initialRobot)
  const { rows, q, convention, base, presetId } = robot
  const [selected, setSelected] = useState(1)
  const [tab, setTab] = useState('joints')
  const [show, setShow] = useState({ axes: true, labels: true, params: true, trail: false })
  const [view, setView] = useState('persp')
  const [resetKey, setResetKey] = useState(0)
  const [ik, setIk] = useState({ on: false, mode: 'translate', orientation: true, goal: { m: null, seed: 0 } })
  const [ikStatus, setIkStatus] = useState(null)
  const [trail, setTrail] = useState([])
  const [cloud, setCloud] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [shared, setShared] = useState(false)
  const tween = useRef(null)

  const fk = useMemo(() => forward(rows, q, convention), [rows, q, convention])
  const reach = useMemo(() => reachOf(rows), [rows])
  const w = useMemo(() => manipulability(rows, q, convention), [rows, q, convention])
  // Reference manipulability (at the preset home pose) to judge "close to singular".
  const wRef = useMemo(() => {
    const home = presetById(presetId)?.home
    return Math.max(1e-6, manipulability(rows, home && home.length === rows.length ? home : rows.map(() => 0), convention), w)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, convention, presetId])

  const robotRef = useRef(robot)
  robotRef.current = robot

  // Trail of the tool tip.
  useEffect(() => {
    if (!show.trail) return
    const p = position(fk.tool)
    setTrail((t) => {
      const last = t[t.length - 1]
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.003) return t
      return [...t.slice(-3000), p]
    })
  }, [fk, show.trail])

  const stopTween = () => {
    if (tween.current) cancelAnimationFrame(tween.current)
    tween.current = null
  }

  /** Smoothly moves the joints to `target` (joint-space interpolation, like MoveJ). */
  const animateTo = useCallback((target, ms = 900) => {
    stopTween()
    const from = robotRef.current.q.slice()
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms)
      const s = k * k * (3 - 2 * k)
      setRobot((r) => ({ ...r, q: from.map((v, i) => v + (target[i] - v) * s) }))
      tween.current = k < 1 ? requestAnimationFrame(step) : null
    }
    tween.current = requestAnimationFrame(step)
  }, [])

  const structural = (next) => {
    stopTween()
    setCloud(null)
    setTrail([])
    setRobot((r) => ({ ...r, presetId: 'custom', ...next(r) }))
  }

  const pickPreset = (id) => {
    stopTween()
    const p = presetById(id)
    setRobot(fromPreset(p))
    setSelected(Math.min(1, p.rows.length - 1))
    setCloud(null)
    setTrail([])
    setIk((s) => ({ ...s, on: false }))
    setResetKey((k) => k + 1)
  }

  const setJoint = (i, v) => {
    stopTween()
    setRobot((r) => ({ ...r, q: r.q.map((x, j) => (j === i ? v : x)) }))
  }

  const changeRow = (i, patch) =>
    structural((r) => {
      const rowsN = r.rows.map((row, j) => {
        if (j !== i) return row
        const next = { ...row, ...patch }
        return patch.type && patch.type !== row.type ? { ...next, ...defaultLimits(patch.type) } : next
      })
      return { rows: rowsN, q: r.q.map((v, j) => clampJoint(rowsN[j], patch.type && j === i ? 0 : v)) }
    })

  const addRow = (type) => {
    structural((r) => ({ rows: [...r.rows, newRow(type)], q: [...r.q, 0] }))
    setSelected(rows.length)
  }

  const removeRow = (i) => {
    structural((r) => ({ rows: r.rows.filter((_, j) => j !== i), q: r.q.filter((_, j) => j !== i) }))
    setSelected((s) => (s == null ? s : Math.max(0, Math.min(s, rows.length - 2))))
  }

  const setLimits = (i, patch) =>
    setRobot((r) => {
      const rowsN = r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row))
      return { ...r, presetId: 'custom', rows: rowsN, q: r.q.map((v, j) => clampJoint(rowsN[j], v)) }
    })

  const randomPose = () => animateTo(rows.map((r) => r.min + Math.random() * (r.max - r.min)).map((v, i) => (rows[i].type === 'R' ? Math.max(-170, Math.min(170, v)) : v)))
  const homePose = () => animateTo(presetById(presetId)?.home?.length === rows.length ? presetById(presetId).home : rows.map(() => 0))

  const computeCloud = () => {
    const pts = []
    for (let n = 0; n < 5000; n++) {
      const qs = rows.map((r) => r.min + Math.random() * (r.max - r.min))
      pts.push(...position(forward(rows, qs, convention).tool))
    }
    setCloud(pts)
  }

  const toggleIk = (on) => {
    stopTween()
    setIk((s) => ({ ...s, on, goal: { m: fk.tool, seed: s.goal.seed + 1 } }))
    setIkStatus(null)
  }

  const onGoal = useCallback(
    (m) => {
      const r = robotRef.current
      const res = solveIK(r.rows, r.q, m, { convention: r.convention, orientation: ik.orientation && r.rows.length >= 6, iterations: 60 })
      setRobot((cur) => ({ ...cur, q: res.q }))
      setIkStatus(res)
    },
    [ik.orientation],
  )

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeRobot(robot)}`
    window.history.replaceState(null, '', url)
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Robot kol', url })
      else await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 1500)
    } catch {
      /* cancelled */
    }
  }

  const preset = presetById(presetId)

  return (
    <div className="relative flex h-full flex-col md:block">
      <div className="relative min-h-0 flex-1 md:absolute md:inset-0">
        <Canvas shadows camera={{ position: [1.8, 1.4, 1.8], fov: 45, near: 0.01, far: 100 }} dpr={[1, 2]}>
          <Scene
            fk={fk}
            rows={rows}
            convention={convention}
            base={base}
            selected={selected}
            show={show}
            view={view}
            resetKey={resetKey}
            ik={ik}
            onGoal={onGoal}
            trail={trail}
            cloud={cloud}
            reach={reach}
          />
        </Canvas>
        <PosePanel fk={fk} w={w} wRef={wRef} ikStatus={ikStatus} ikOn={ik.on} />
        <Button
          size="icon"
          variant={panelOpen ? 'outline' : 'default'}
          className="absolute bottom-3 left-3 size-11 rounded-full backdrop-blur md:hidden"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label="Paneli aç/kapat"
        >
          <PanelLeft className="size-5" />
        </Button>
      </div>

      <Card
        className={`gap-4 overflow-y-auto rounded-none rounded-t-xl border-x-0 border-b-0 py-4 backdrop-blur md:absolute md:top-4 md:left-4 md:max-h-[calc(100%-2rem)] md:w-104 md:rounded-xl md:border md:py-5 ${
          panelOpen ? 'max-h-[55%]' : 'hidden md:flex'
        }`}
      >
        <CardHeader className="hidden md:grid">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-primary" /> Robot Kol · DH
          </CardTitle>
          <CardDescription>DH tablosunu değiştir, eksenleri ve kolu 3B izle.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4 md:px-6">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Select value={presetId === 'custom' ? '' : presetId} onValueChange={pickPreset}>
              <SelectTrigger className="w-full *:data-[slot=select-value]:flex-1" aria-label="Hazır robot">
                <Bot className="text-primary" />
                <SelectValue placeholder="Özel robot" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id} hint={p.description}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={convention}
              onValueChange={(v) => v && structural(() => ({ convention: v }))}
              className="h-9"
            >
              <ToggleGroupItem value="standard" className="h-9 px-2.5 text-xs" title="Standart DH: Rz(θ)·Tz(d)·Tx(a)·Rx(α)">
                Std
              </ToggleGroupItem>
              <ToggleGroupItem value="modified" className="h-9 px-2.5 text-xs" title="Modified DH (Craig): Rx(α₋₁)·Tx(a₋₁)·Rz(θ)·Tz(d)">
                Mod
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="-mt-2 font-mono text-[11px] text-muted-foreground">
            Aᵢ = {convention === 'modified' ? 'Rx(αᵢ₋₁)·Tx(aᵢ₋₁)·Rz(θᵢ)·Tz(dᵢ)' : 'Rz(θᵢ)·Tz(dᵢ)·Tx(aᵢ)·Rx(αᵢ)'}
            {preset ? '' : ' · özel'}
          </p>

          <ToggleGroup type="single" variant="outline" size="sm" value={tab} onValueChange={(v) => v && setTab(v)} className="w-full">
            <ToggleGroupItem value="joints" className="gap-1 text-xs">
              <SlidersHorizontal /> Eklemler
            </ToggleGroupItem>
            <ToggleGroupItem value="dh" className="gap-1 text-xs">
              <Table2 /> DH tablosu
            </ToggleGroupItem>
            <ToggleGroupItem value="view" className="gap-1 text-xs">
              <Eye /> Görünüm
            </ToggleGroupItem>
          </ToggleGroup>

          {tab === 'joints' && (
            <>
              <JointSliders rows={rows} q={q} selected={selected} onSelect={setSelected} onQ={setJoint} onLimits={setLimits} />
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="secondary" onClick={homePose}>
                  <Home /> Ev
                </Button>
                <Button size="sm" variant="secondary" onClick={randomPose}>
                  <Dices /> Rastgele
                </Button>
                <Button size="sm" variant="outline" onClick={share}>
                  {shared ? <Check className="text-primary" /> : <Share2 />} {shared ? 'Kopyalandı' : 'Paylaş'}
                </Button>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <Toggler pressed={ik.on} onChange={toggleIk} icon={Crosshair} title="Kırmızı hedefi sürükle, kol ters kinematikle takip etsin">
                  Ters kinematik (hedefi sürükle): {ik.on ? 'açık' : 'kapalı'}
                </Toggler>
                {ik.on && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <ToggleGroup type="single" variant="outline" size="sm" value={ik.mode} onValueChange={(v) => v && setIk((s) => ({ ...s, mode: v }))} className="w-full">
                      <ToggleGroupItem value="translate" className="gap-1 text-xs">
                        <Move3d /> Taşı
                      </ToggleGroupItem>
                      <ToggleGroupItem value="rotate" className="gap-1 text-xs">
                        <Rotate3d /> Döndür
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={ik.orientation}
                      onPressedChange={(v) => setIk((s) => ({ ...s, orientation: v }))}
                      disabled={rows.length < 6}
                      className="text-xs data-[state=on]:border-primary/60 data-[state=on]:bg-transparent"
                      title="Açıkken uç hem konuma hem yönelime gider (6 eksen gerekir)"
                    >
                      Yönelim
                    </Toggle>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'dh' && (
            <DHTable rows={rows} convention={convention} selected={selected} onSelect={setSelected} onChange={changeRow} onAdd={addRow} onRemove={removeRow} />
          )}

          {tab === 'view' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Toggler pressed={show.axes} onChange={(v) => setShow((s) => ({ ...s, axes: v }))} icon={Axis3d}>
                  Eksenler
                </Toggler>
                <Toggler pressed={show.labels} onChange={(v) => setShow((s) => ({ ...s, labels: v }))} icon={Tag}>
                  Etiketler
                </Toggler>
                <Toggler pressed={show.params} onChange={(v) => setShow((s) => ({ ...s, params: v }))} icon={Ruler} title="Seçili satırın θ, d, a, α değerlerini sahnede gösterir">
                  DH ölçüleri
                </Toggler>
                <Toggler
                  pressed={show.trail}
                  onChange={(v) => {
                    setShow((s) => ({ ...s, trail: v }))
                    if (!v) setTrail([])
                  }}
                  icon={Spline}
                >
                  Uç izi
                </Toggler>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={computeCloud}>
                  <Sparkles /> Çalışma alanı
                </Button>
                <Button size="sm" variant="outline" onClick={() => (setCloud(null), setTrail([]))} disabled={!cloud && !trail.length}>
                  <Eraser /> Temizle
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Kamera</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={view}
                  onValueChange={(v) => {
                    if (v) setView(v)
                    setResetKey((k) => k + 1)
                  }}
                  className="w-full"
                >
                  <ToggleGroupItem value="persp" className="text-xs">
                    <Box /> Persp.
                  </ToggleGroupItem>
                  <ToggleGroupItem value="front" className="text-xs">
                    Ön
                  </ToggleGroupItem>
                  <ToggleGroupItem value="side" className="text-xs">
                    Yan
                  </ToggleGroupItem>
                  <ToggleGroupItem value="top" className="text-xs">
                    <Grid3x3 /> Üst
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-muted-foreground">
                <span>Taban yüksekliği (m)</span>
                <NumField value={base} onCommit={(v) => v >= 0 && v <= 3 && setRobot((r) => ({ ...r, base: v }))} aria-label="Taban yüksekliği" />
              </div>
            </div>
          )}

          <Separator className="hidden md:block" />
          <p className="hidden text-[11px] text-muted-foreground md:block">
            <span className="text-red-400">X</span> <span className="text-green-400">Y</span> <span className="text-blue-400">Z</span> eksenleri; seçili satırın{' '}
            <span className="text-yellow-300">θ</span>, <span className="text-cyan-300">d</span>, <span className="text-fuchsia-400">a</span>,{' '}
            <span className="text-lime-400">α</span> değerleri sahnede çizilir. Sol tık döndürür, sağ tık kaydırır, tekerlek yakınlaştırır.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
