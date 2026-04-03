import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type WorkOrderDetailPublic, workOrdersApi } from "@/api/workOrders"
import { UsersService } from "@/client/index.ts"
import { MaintenanceCalendar } from "@/components/Equipment/MaintenanceCalendar.tsx"
import { WorkOrderDetailDrawer } from "@/components/Equipment/WorkOrderDetailDrawer.tsx"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

type MaintenanceEventDropArgs = {
  payload: {
    kind: "maintenance_event"
    equipment_id: string
    interval_hours: number | null
  }
  start_at: string
  end_at: string
  target_work_order_id?: string | null
}

export function MaintenanceCalendarPage() {
  const toast = useCustomToast()
  const queryClient = useQueryClient()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string>("")

  const { data: usersData } = useQuery({
    queryKey: ["users", "list", { limit: 200 }],
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 200 }),
  })

  const users = (usersData?.data ?? []) as {
    id: string
    full_name: string | null
    email: string
  }[]

  const [dropDialogOpen, setDropDialogOpen] = useState(false)
  const [pendingDrop, setPendingDrop] =
    useState<MaintenanceEventDropArgs | null>(null)
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("")

  const openDropDialog = (args: MaintenanceEventDropArgs) => {
    setPendingDrop(args)
    setSelectedAssigneeId("")
    setDropDialogOpen(true)
  }

  const onCancel = () => {
    setDropDialogOpen(false)
    setPendingDrop(null)
  }

  const createOrRescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!pendingDrop) throw new Error("Drop arguments missing")

      const assigned_to_id = selectedAssigneeId ? selectedAssigneeId : null

      if (pendingDrop.target_work_order_id) {
        const updated = await workOrdersApi.update(
          pendingDrop.target_work_order_id,
          {
            start_at: pendingDrop.start_at,
            end_at: pendingDrop.end_at,
            assigned_to_id,
          },
        )
        return updated
      }

      const created = await workOrdersApi.createFromMaintenanceEvent({
        equipment_id: pendingDrop.payload.equipment_id,
        interval_hours: pendingDrop.payload.interval_hours,
        start_at: pendingDrop.start_at,
        end_at: pendingDrop.end_at,
        assigned_to_id,
      })
      return created
    },
    onSuccess: (order: WorkOrderDetailPublic | any) => {
      queryClient.invalidateQueries({ queryKey: ["work-orders", "events"] })
      queryClient.invalidateQueries({
        queryKey: ["maintenance-calendar-events"],
      })
      queryClient.invalidateQueries({ queryKey: ["work-order", order.id] })

      setSelectedWorkOrderId(order.id)
      setDrawerOpen(true)
      toast.showSuccessToast(
        pendingDrop?.target_work_order_id
          ? "Заявка перенесена"
          : "Заявка создана из календаря ТО",
      )

      setDropDialogOpen(false)
      setPendingDrop(null)
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error
          ? err.message
          : "Не удалось создать/перенести заявку",
      )
    },
  })

  return (
    <div>
      <MaintenanceCalendar
        onMaintenanceEventDrop={(args) => openDropDialog(args)}
      />

      {selectedWorkOrderId ? (
        <WorkOrderDetailDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          workOrderId={selectedWorkOrderId}
        />
      ) : null}

      <DialogRoot
        open={dropDialogOpen}
        onOpenChange={(e) => (e.open ? null : onCancel())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Назначение и подтверждение</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-2 text-sm text-muted-foreground">
              Выберите исполнителя для создаваемой/переносимой заявки.
            </p>
            <Select
              value={toSelectAll(selectedAssigneeId)}
              onValueChange={(v) => setSelectedAssigneeId(fromSelectAll(v))}
            >
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue placeholder="Исполнитель" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL_VALUE}>
                  — Не назначен —
                </SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <div className="flex w-full items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={createOrRescheduleMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                variant="solid"
                size="sm"
                onClick={() => createOrRescheduleMutation.mutate()}
                loading={createOrRescheduleMutation.isPending}
                disabled={!pendingDrop}
              >
                Подтвердить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  )
}
