import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiUsers } from "react-icons/fi"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { request } from "@/lib/apiClient"

export const Route = createFileRoute("/_layout/technique/technicians")({
  component: TechniciansSection,
})

interface UserPublic {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  role_id: string | null
}

interface UsersResponse {
  data: UserPublic[]
  count: number
}

interface WorkOrderPublic {
  id: string
  assigned_to_id: string | null
  status: string
}

interface WorkOrderListResponse {
  data: WorkOrderPublic[]
  count: number
}

interface RolePublic {
  id: string
  name: string
}

function TechniciansSection() {
  const [users, setUsers] = useState<UserPublic[]>([])
  const [roles, setRoles] = useState<RolePublic[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrderPublic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, rolesRes, woRes] = await Promise.all([
          request<UsersResponse>("/api/v1/users/?limit=500"),
          request<RolePublic[]>("/api/v1/roles/"),
          request<WorkOrderListResponse>("/api/v1/work-orders?limit=500"),
        ])
        setUsers(usersRes.data)
        setRoles(rolesRes)
        setWorkOrders(woRes.data)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const warehouseRoleId = roles.find((r) => r.name === "warehouse")?.id
  const technicians = warehouseRoleId
    ? users.filter((u) => u.role_id === warehouseRoleId)
    : users.filter((u) => !u.is_active === false)

  const woCounts = new Map<string, { active: number; total: number }>()
  for (const wo of workOrders) {
    if (!wo.assigned_to_id) continue
    const entry = woCounts.get(wo.assigned_to_id) ?? { active: 0, total: 0 }
    entry.total++
    if (wo.status === "open" || wo.status === "in_progress") entry.active++
    woCounts.set(wo.assigned_to_id, entry)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Техники</h1>
        <p className="text-sm text-muted-foreground">
          Пользователи с ролью «Складской работник» и назначенные заявки
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : technicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FiUsers className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Нет пользователей с ролью «warehouse»
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">
                  Активные заявки
                </TableHead>
                <TableHead className="text-center">
                  Всего заявок
                </TableHead>
                <TableHead className="text-center">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.map((u) => {
                const counts = woCounts.get(u.id)
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.full_name || "—"}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="text-center">
                      {counts?.active ?? 0}
                    </TableCell>
                    <TableCell className="text-center">
                      {counts?.total ?? 0}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={u.is_active ? "default" : "secondary"}
                        className={
                          u.is_active
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : ""
                        }
                      >
                        {u.is_active ? "Активен" : "Неактивен"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
