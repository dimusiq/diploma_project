import type { WorkerMotion } from "@/components/deviceServer/simStore.ts"
import { motionLabel, shiftLabel, zoneLabel } from "@/lib/personnel.ts"

export function PersonnelRuntimePanel({
  person,
  taskTitle,
}: {
  person: WorkerMotion
  taskTitle?: string | null
}) {
  const name = person.displayName || person.name
  const zone = person.currentZone || person.target
  return (
    <aside className="space-y-4 rounded-lg border bg-card p-4 text-sm" data-testid="personnel-runtime-panel">
      <div>
        <h2 className="text-base font-semibold">{name}</h2>
        <p className="text-muted-foreground">{person.positionTitle || "Сотрудник склада"}</p>
      </div>
      <dl className="space-y-1">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Код</dt>
          <dd className="font-mono">{person.employeeCode || person.code || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Должность</dt>
          <dd>{person.positionTitle || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Смена</dt>
          <dd>{shiftLabel(person.shift)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Статус</dt>
          <dd>На смене</dd>
        </div>
      </dl>
      <div className="space-y-1 border-t pt-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Digital Twin</p>
        <p>Runtime: {person.code || person.id}</p>
        <p>Зона: {zoneLabel(zone)}</p>
        <p>Состояние: {motionLabel(person.status)}</p>
        <p>Скорость: {person.speed.toFixed(1)} м/с</p>
        <p>Текущая задача: {taskTitle || "—"}</p>
      </div>
    </aside>
  )
}
