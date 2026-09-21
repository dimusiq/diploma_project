import { useEffect, useMemo, useState } from "react"
import { fetchSimEvents, type SimEventLogItem } from "@/api/deviceServer.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { getEventTypeLabel } from "@/lib/statusLabels.ts"

const SPEEDS = [1, 2, 5, 10]

export function EventReplay() {
  const [events, setEvents] = useState<SimEventLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    let cancelled = false
    void fetchSimEvents({ limit: 400 })
      .then((page) => {
        if (cancelled) return
        const ordered = [...page.data].sort((a, b) => a.at - b.at || a.id - b.id)
        setEvents(ordered)
        setIndex(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!playing || events.length < 2) return
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current >= events.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, Math.max(80, 700 / speed))
    return () => window.clearInterval(timer)
  }, [playing, speed, events.length])

  const current = events[index]
  const span = useMemo(() => {
    if (events.length === 0) return { start: 0, end: 0 }
    return { start: events[0].at, end: events[events.length - 1].at }
  }, [events])

  return (
    <Card className="mb-6 ring-foreground/10">
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-semibold">Replay</h2>
            <p className="text-xs text-muted-foreground">
              Воспроизведение сохранённой истории. Live simulation не запускается.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant="outline"
              disabled={events.length === 0}
              onClick={() => setIndex(0)}
            >
              |&lt;
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              &lt;
            </Button>
            <Button
              size="xs"
              disabled={events.length < 2}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? "Пауза" : "Play"}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={index >= events.length - 1}
              onClick={() =>
                setIndex((value) => Math.min(events.length - 1, value + 1))
              }
            >
              &gt;
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={events.length === 0}
              onClick={() => setIndex(Math.max(0, events.length - 1))}
            >
              &gt;|
            </Button>
            {SPEEDS.map((value) => (
              <Button
                key={value}
                size="xs"
                variant={speed === value ? "default" : "outline"}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </Button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка истории…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет сохранённых событий для replay.
          </p>
        ) : (
          <>
            <input
              aria-label="Позиция replay"
              className="w-full"
              type="range"
              min={0}
              max={Math.max(0, events.length - 1)}
              value={index}
              onChange={(event) => {
                setPlaying(false)
                setIndex(Number(event.target.value))
              }}
            />
            <p className="text-xs text-muted-foreground">
              {formatSec(span.start)} — {formatSec(current?.at ?? span.start)} —{" "}
              {formatSec(span.end)} · {index + 1} / {events.length}
            </p>
            {current ? (
              <button
                type="button"
                className="w-full rounded-md border px-3 py-2 text-left text-sm"
              >
                <span className="font-medium">
                  {getEventTypeLabel(current.type)}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {current.message}
                </span>
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function formatSec(value: number): string {
  const total = Math.max(0, Math.floor(value))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}
