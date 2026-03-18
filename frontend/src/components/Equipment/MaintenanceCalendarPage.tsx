import { Box, Button, HStack, Text } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { UsersService } from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { workOrdersApi, type WorkOrderDetailPublic } from "@/api/workOrders"
import { MaintenanceCalendar } from "@/components/Equipment/MaintenanceCalendar.tsx"
import { WorkOrderDetailDrawer } from "@/components/Equipment/WorkOrderDetailDrawer.tsx"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"

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

  const users = (usersData?.data ?? []) as { id: string; full_name: string | null; email: string }[]

  const [dropDialogOpen, setDropDialogOpen] = useState(false)
  const [pendingDrop, setPendingDrop] = useState<MaintenanceEventDropArgs | null>(null)
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
        const updated = await workOrdersApi.update(pendingDrop.target_work_order_id, {
          start_at: pendingDrop.start_at,
          end_at: pendingDrop.end_at,
          assigned_to_id,
        })
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
      queryClient.invalidateQueries({ queryKey: ["maintenance-calendar-events"] })
      queryClient.invalidateQueries({ queryKey: ["work-order", order.id] })

      setSelectedWorkOrderId(order.id)
      setDrawerOpen(true)
      toast.showSuccessToast(
        pendingDrop?.target_work_order_id ? "Заявка перенесена" : "Заявка создана из календаря ТО",
      )

      setDropDialogOpen(false)
      setPendingDrop(null)
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error ? err.message : "Не удалось создать/перенести заявку",
      )
    },
  })

  return (
    <Box>
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

      <DialogRoot open={dropDialogOpen} onOpenChange={(e) => (e.open ? null : onCancel())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Назначение и подтверждение</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text fontSize="sm" color="fg.muted" mb={2}>
              Выберите исполнителя для создаваемой/переносимой заявки.
            </Text>
            <select
              value={selectedAssigneeId}
              onChange={(e) => setSelectedAssigneeId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--chakra-colors-border)",
              }}
            >
              <option value="">— Не назначен —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
          </DialogBody>
          <DialogFooter>
            <HStack w="full" justify="space-between">
              <Button variant="outline" size="sm" onClick={onCancel} disabled={createOrRescheduleMutation.isPending}>
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
            </HStack>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Box>
  )
}

