import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { AdminAudit } from "@/components/Admin/AdminAudit.tsx"
import { AdminBrands } from "@/components/Admin/AdminBrands.tsx"
import { AdminCategories } from "@/components/Admin/AdminCategories.tsx"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import { AdminUsers } from "@/components/Admin/AdminUsers.tsx"
import { AdminZones } from "@/components/Admin/AdminZones.tsx"
import { AgentChatLogsAdmin } from "@/components/Admin/AgentChatLogsAdmin.tsx"
import { AgentGovernanceAdmin } from "@/components/Admin/AgentGovernanceAdmin.tsx"
import { AgentKnowledgeAdmin } from "@/components/Admin/AgentKnowledgeAdmin.tsx"
import { WarehouseTopologyAdmin } from "@/components/Admin/WarehouseTopologyAdmin.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { boolQuerySearch, pageNumberSearch } from "@/lib/routeSearch.ts"

const usersSearchSchema = z.object({
  page: pageNumberSearch,
  deleted: boolQuerySearch,
})

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: (search) => usersSearchSchema.parse(search),
})

function Admin() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { page, deleted } = Route.useSearch()

  const setPage = (p: number) =>
    (
      navigate as unknown as (opts: {
        search: (prev: { page: number; deleted: boolean }) => {
          page: number
          deleted: boolean
        }
      }) => void
    )({
      search: (prev) => ({ ...prev, page: p }),
    })

  const setDeleted = (d: boolean) =>
    (
      navigate as unknown as (opts: {
        search: (prev: { page: number; deleted: boolean }) => {
          page: number
          deleted: boolean
        }
      }) => void
    )({
      search: (prev) => ({ ...prev, deleted: d, page: 1 }),
    })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6 md:py-6">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Администрирование
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Настройки приложения, пользователи, журнал аудита и сервисы
          ассистента.
        </p>
      </div>

      <Tabs defaultValue="app-settings" className="w-full">
        <TabsList
          variant="line"
          className="mb-0 h-auto w-full flex-wrap justify-start gap-1 gap-y-2"
        >
          <TabsTrigger value="app-settings">Приложение</TabsTrigger>
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="audit">Журнал аудита</TabsTrigger>
          <TabsTrigger value="agent-knowledge">База знаний</TabsTrigger>
          <TabsTrigger value="agent-logs">Чат ассистента</TabsTrigger>
          <TabsTrigger value="agent-governance">Агент</TabsTrigger>
          <TabsTrigger value="warehouse-topology">Топология склада</TabsTrigger>
        </TabsList>

        <TabsContent value="app-settings" className="mt-4 outline-none">
          <AdminCategories />
          <AdminBrands />
          <AdminZones />
        </TabsContent>

        <TabsContent value="users" className="mt-4 outline-none">
          <AdminUsers
            page={page}
            deleted={deleted}
            setPage={setPage}
            setDeleted={setDeleted}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4 outline-none">
          <AdminAudit />
        </TabsContent>

        <TabsContent value="agent-knowledge" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <AgentKnowledgeAdmin />
          </AdminPanel>
        </TabsContent>

        <TabsContent value="agent-logs" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <AgentChatLogsAdmin />
          </AdminPanel>
        </TabsContent>

        <TabsContent value="agent-governance" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <AgentGovernanceAdmin />
          </AdminPanel>
        </TabsContent>

        <TabsContent value="warehouse-topology" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <WarehouseTopologyAdmin />
          </AdminPanel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
