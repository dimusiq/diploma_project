/**
 * Диалог создания заявки на обслуживание/ремонт.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { equipmentApi } from "@/api/equipment.ts"
import {
  WORK_ORDER_PRIORITY_LABELS,
  type WorkOrderCreate,
  workOrdersApi,
} from "@/api/workOrders.ts"
import type { UserPublic } from "@/client/index.ts"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
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

export function CreateWorkOrderDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: UserPublic[]
}) {
  const toast = useCustomToast()
  const queryClient = useQueryClient()
  const [equipmentId, setEquipmentId] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<string>("medium")
  const [assignedToId, setAssignedToId] = useState("")
  const [dueAt, setDueAt] = useState("")

  const { data: equipmentData } = useQuery({
    queryKey: ["equipment", "all"],
    queryFn: () => equipmentApi.list({ limit: 500 }),
    enabled: open,
  })
  const equipmentList = equipmentData?.data ?? []

  const createMutation = useMutation({
    mutationFn: (body: WorkOrderCreate) => workOrdersApi.create(body),
    onSuccess: () => {
      toast.showSuccessToast("Заявка создана")
      queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      onOpenChange(false)
      setEquipmentId("")
      setTitle("")
      setDescription("")
      setPriority("medium")
      setAssignedToId("")
      setDueAt("")
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error ? err.message : "Ошибка создания заявки",
      )
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipmentId.trim()) {
      toast.showErrorToast("Выберите технику")
      return
    }
    if (!title.trim()) {
      toast.showErrorToast("Введите заголовок")
      return
    }
    createMutation.mutate({
      equipment_id: equipmentId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority: priority || "medium",
      assigned_to_id: assignedToId || undefined,
      due_at: dueAt ? `${dueAt}T12:00:00Z` : undefined,
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать заявку</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-sm font-medium">Техника</p>
                <Select
                  value={toSelectAll(equipmentId)}
                  onValueChange={(v) => setEquipmentId(fromSelectAll(v))}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="— Выберите технику —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_ALL_VALUE}>
                      — Выберите технику —
                    </SelectItem>
                    {equipmentList.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {[eq.brand_name, eq.model].filter(Boolean).join(" ")}{" "}
                        {eq.garage_number ? `(${eq.garage_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Заголовок</p>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Краткое описание заявки"
                  maxLength={256}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Описание (необязательно)
                </p>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Подробности"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Приоритет</p>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(WORK_ORDER_PRIORITY_LABELS).map(
                      ([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Исполнитель (необязательно)
                </p>
                <Select
                  value={toSelectAll(assignedToId)}
                  onValueChange={(v) => setAssignedToId(fromSelectAll(v))}
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
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Срок (необязательно)</p>
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="solid"
              size="sm"
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
            >
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
