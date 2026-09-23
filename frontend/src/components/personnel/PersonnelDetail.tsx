import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import type { PersonnelActivity } from "@/api/personnel.ts"
import {
  employeeStatusLabel,
  fullName,
  motionLabel,
  shiftLabel,
  zoneLabel,
  type PersonnelRecord,
} from "@/lib/personnel.ts"

export function PersonnelDetail({
  employee,
  activity,
  tasks,
  events,
}: {
  employee: PersonnelRecord
  activity: PersonnelActivity | null
  tasks: { id: string; title: string }[]
  events: { id: string; title: string }[]
}) {
  const zone = activity?.zone ?? employee.current_zone
  const motion = activity?.motion_status ?? employee.motion_status
  const speed = activity?.speed ?? employee.speed
  return (
    <Tabs defaultValue="profile">
      <TabsList className="flex-wrap">
        <TabsTrigger value="profile">Основная информация</TabsTrigger>
        <TabsTrigger value="activity">Текущая активность</TabsTrigger>
        <TabsTrigger value="tasks">Задачи</TabsTrigger>
        <TabsTrigger value="events">События</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="mt-4 space-y-2 text-sm">
        <p className="text-base font-semibold">{fullName(employee)}</p>
        <p>Код: {employee.employee_code}</p>
        <p>Должность: {employee.position}</p>
        <p>Подразделение: {employee.department}</p>
        <p>Смена: {shiftLabel(employee.shift)}</p>
        <p>Статус: {employeeStatusLabel(employee.status)}</p>
        <p>Телефон: {employee.phone || "—"}</p>
        <p>Email: {employee.email || "—"}</p>
        <p>Дата приёма: {employee.hire_date || "—"}</p>
        <p>Заметки: {employee.notes || "—"}</p>
      </TabsContent>
      <TabsContent value="activity" className="mt-4 space-y-2 text-sm">
        <p>Runtime: {activity?.person_code || employee.person_code || "нет на смене"}</p>
        <p>Зона: {zoneLabel(zone)}</p>
        <p>Состояние: {motionLabel(motion)}</p>
        <p>Скорость: {speed != null ? `${speed.toFixed(1)} м/с` : "—"}</p>
        <p>Цель: {activity?.target ? zoneLabel(activity.target) : "—"}</p>
      </TabsContent>
      <TabsContent value="tasks" className="mt-4 space-y-2 text-sm">
        {tasks.length === 0 ? <p className="text-muted-foreground">Нет назначенных заданий</p> : null}
        {tasks.map((task) => (
          <p key={task.id}>{task.title}</p>
        ))}
      </TabsContent>
      <TabsContent value="events" className="mt-4 space-y-2 text-sm">
        {events.length === 0 ? <p className="text-muted-foreground">Нет событий</p> : null}
        {events.map((event) => (
          <p key={event.id}>{event.title}</p>
        ))}
      </TabsContent>
    </Tabs>
  )
}
