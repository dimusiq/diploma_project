import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { FiShield } from "react-icons/fi"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { request } from "@/lib/apiClient"

export const Route = createFileRoute("/_layout/technique/security")({
  component: SecuritySection,
})

interface RoleDetail {
  id: string
  name: string
  permissions: string[]
  user_count: number
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  warehouse: "Складской работник",
  viewer: "Наблюдатель",
}

const PERM_LABELS: Record<string, string> = {
  "items.read_all": "Просмотр всех товаров",
  "items.change_status": "Смена статуса товара",
  "users.manage": "Управление пользователями",
  "roles.read": "Просмотр ролей",
  "categories.manage": "Управление категориями",
  "brands.manage": "Управление брендами",
  "zones.manage": "Управление зонами",
  "audit.read": "Просмотр аудита",
  "maintenance_schedule.view": "Просмотр расписания ТО",
  "maintenance_schedule.edit": "Редактирование расписания ТО",
  "agent.use": "Использование ассистента",
  "warehouse.tasks.read": "Просмотр складских заданий",
  "warehouse.tasks.manage": "Управление складскими заданиями",
  "warehouse.telemetry.ingest": "Загрузка телеметрии",
  "integrations.inbox.read": "Просмотр входящих интеграций",
  "integrations.inbox.write": "Отправка в интеграции",
  "agent.policies.read": "Просмотр политик агента",
  "agent.policies.manage": "Управление политиками агента",
}

function SecuritySection() {
  const [roles, setRoles] = useState<RoleDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await request<RoleDetail[]>("/api/v1/roles/detailed")
        setRoles(data)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const allPerms = Array.from(
    new Set(roles.flatMap((r) => r.permissions)),
  ).sort()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Безопасность и роли
        </h1>
        <p className="text-sm text-muted-foreground">
          Матрица прав доступа по ролям
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FiShield className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Нет данных о ролях
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {ROLE_LABELS[role.name] ?? role.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {role.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Пользователей:
                    </span>
                    <span className="font-semibold">{role.user_count}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Прав:</span>
                    <span className="font-semibold">
                      {role.permissions.length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Матрица прав</h2>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-background min-w-[220px]">
                      Право
                    </TableHead>
                    {roles.map((role) => (
                      <TableHead key={role.id} className="text-center">
                        {ROLE_LABELS[role.name] ?? role.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPerms.map((perm) => (
                    <TableRow key={perm}>
                      <TableCell className="sticky left-0 z-10 bg-background text-sm">
                        <div className="font-medium">
                          {PERM_LABELS[perm] ?? perm}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {perm}
                        </div>
                      </TableCell>
                      {roles.map((role) => (
                        <TableCell key={role.id} className="text-center">
                          {role.permissions.includes(perm) ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
                              ✓
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
