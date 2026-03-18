/**
 * Диалог создания заявки на обслуживание/ремонт.
 */
import {
  Box,
  Button,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { equipmentApi } from "@/api/equipment.ts"
import {
  workOrdersApi,
  WORK_ORDER_PRIORITY_LABELS,
  type WorkOrderCreate,
} from "@/api/workOrders.ts"
import type { UserPublic } from "@/client/index.ts"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

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
      toast.showErrorToast(err instanceof Error ? err.message : "Ошибка создания заявки")
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
          <VStack gap={3} align="stretch">
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Техника
              </Text>
              <select
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--chakra-colors-border)",
                }}
              >
                <option value="">— Выберите технику —</option>
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {[eq.brand_name, eq.model].filter(Boolean).join(" ")}{" "}
                    {eq.garage_number ? `(${eq.garage_number})` : ""}
                  </option>
                ))}
              </select>
            </Box>
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Заголовок
              </Text>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Краткое описание заявки"
                maxLength={256}
                size="sm"
              />
            </Box>
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Описание (необязательно)
              </Text>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Подробности"
                size="sm"
              />
            </Box>
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Приоритет
              </Text>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--chakra-colors-border)",
                }}
              >
                {Object.entries(WORK_ORDER_PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Box>
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Исполнитель (необязательно)
              </Text>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
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
            </Box>
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Срок (необязательно)
              </Text>
              <Input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                size="sm"
              />
            </Box>
          </VStack>
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
