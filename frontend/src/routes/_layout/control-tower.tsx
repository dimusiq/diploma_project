import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { fetchFeatureFlags } from "@/api/integrations.ts"
import { fetchKpiSnapshot } from "@/api/warehouseSimulation.ts"
import { DashboardService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
export const Route = createFileRoute("/_layout/control-tower")({
  component: ControlTowerPage,
})

function ControlTowerPage() {
  const navigate = useNavigate()
  const flagsQ = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
  })
  const dashQ = useQuery({
    queryKey: ["control-tower-dashboard"],
    queryFn: () => DashboardService.getDashboardStats(),
    enabled: flagsQ.data?.["control_tower.enabled"] === true,
  })
  const kpiQ = useQuery({
    queryKey: ["control-tower-kpi"],
    queryFn: fetchKpiSnapshot,
    enabled: flagsQ.data?.["control_tower.enabled"] === true,
  })

  if (flagsQ.isPending) {
    return (
      <div className="mx-auto max-w-6xl py-8">
        <Skeleton className="h-[200px]" />
      </div>
    )
  }

  if (flagsQ.isError || flagsQ.data?.["control_tower.enabled"] !== true) {
    return (
      <div className="mx-auto max-w-6xl py-8">
        <h1 className="font-heading mb-4 text-2xl font-semibold">
          Control Tower
        </h1>
        <p className="text-muted-foreground">
          Экран отключён feature flag <code>control_tower.enabled</code> или
          недоступен. Обратитесь к администратору.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void navigate({ to: "/" })}
        >
          На главную
        </Button>
      </div>
    )
  }

  const stats = dashQ.data as Record<string, unknown> | undefined
  const kpi = kpiQ.data

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-6 md:px-4 md:py-10">
      <h1 className="font-heading mb-2 text-2xl font-semibold">
        Control Tower
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Сводка KPI, ссылка на live-поток двойника и быстрый доступ к заданиям и
        симуляциям.
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 font-semibold">Операции (дашборд)</p>
            {dashQ.isPending ? (
              <Skeleton className="h-[60px]" />
            ) : dashQ.isError ? (
              <p className="text-sm text-muted-foreground">Нет данных</p>
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  Всего позиций:{" "}
                  {typeof stats?.total_items === "number"
                    ? stats.total_items
                    : "—"}
                </p>
                <p>
                  Пользователей:{" "}
                  {typeof stats?.total_users === "number"
                    ? stats.total_users
                    : "—"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 font-semibold">Двойник / склад</p>
            {kpiQ.isPending ? (
              <Skeleton className="h-[60px]" />
            ) : kpiQ.isError ? (
              <p className="text-sm text-muted-foreground">KPI недоступны</p>
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  Точность остатков (proxy):{" "}
                  {kpi?.stock_accuracy_proxy != null
                    ? `${(kpi.stock_accuracy_proxy * 100).toFixed(1)}%`
                    : "—"}
                </p>
                <p>Просрочка 30д: {kpi?.near_expiry_items_30d ?? "—"}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 font-semibold">Live и очереди</p>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Live-поток: эндпоинт <code>/api/v1/warehouse/live/stream</code>{" "}
                (тот же канал, что <code>/api/v1/twin/stream</code>), с токеном
                авторизации.
              </p>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="inline-flex w-fit"
              >
                <Link
                  to="/digital-twin"
                  search={{ tab: "analytics", view: "2d" }}
                >
                  Digital Twin
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="inline-flex w-fit"
              >
                <Link to="/warehouse-tasks">Складские задания</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
