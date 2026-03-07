/**
 * Общий список проведённых ТО для раздела «Обслуживание и ремонт техники».
 */
import {
  Box,
  Button,
  Flex,
  Input,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FaPlus } from "react-icons/fa"

import {
  type EquipmentPublic,
  equipmentApi,
  type MaintenanceRecordCreate,
} from "@/api/equipment.ts"
import {
  apiChainToLegacyFormat,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { getIntervalHoursForEquipment } from "@/utils/maintenanceChains.ts"

function CreateOrderDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const toast = useCustomToast()
  const [equipmentId, setEquipmentId] = useState("")
  const [performedAt, setPerformedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [intervalHours, setIntervalHours] = useState(500)
  const [engineHoursAtService, setEngineHoursAtService] = useState<string>("")
  const [comment, setComment] = useState("")

  const { data: chainsData } = useQuery({
    queryKey: ["maintenance-chains"],
    queryFn: () => maintenanceScheduleApi.listChains(),
    enabled: open,
  })
  const chains = (chainsData?.data ?? []).map(apiChainToLegacyFormat)
  const chainIntervals = getIntervalHoursForEquipment(equipmentId, chains)

  useEffect(() => {
    if (
      chainIntervals.length > 0 &&
      !chainIntervals.includes(intervalHours)
    ) {
      setIntervalHours(chainIntervals[0])
    }
  }, [equipmentId, chainIntervals, intervalHours])

  const { data: equipmentData } = useQuery({
    queryKey: ["equipment", "all"],
    queryFn: () => equipmentApi.list({ limit: 500 }),
    enabled: open,
  })
  const equipmentList: EquipmentPublic[] = equipmentData?.data ?? []

  const createMutation = useMutation({
    mutationFn: (body: MaintenanceRecordCreate) =>
      equipmentApi.createMaintenanceRecord(equipmentId, body),
    onSuccess: () => {
      toast.showSuccessToast("Заказ создан")
      onSuccess()
      onOpenChange(false)
      setEquipmentId("")
      setEngineHoursAtService("")
      setComment("")
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error ? err.message : "Что-то пошло не так.",
      )
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipmentId.trim()) {
      toast.showErrorToast("Выберите технику")
      return
    }
    createMutation.mutate({
      performed_at: performedAt,
      interval_hours: intervalHours,
      engine_hours_at_service: engineHoursAtService.trim()
        ? parseInt(engineHoursAtService, 10)
        : undefined,
      comment: comment.trim() || undefined,
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Создать заказ (проведённое ТО)</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={3} align="stretch">
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Техника
                </Text>
                <select
                  value={equipmentId}
                  onChange={(e) => {
                    const id = e.target.value
                    setEquipmentId(id)
                    const intervals = getIntervalHoursForEquipment(id, chains)
                    if (intervals.length > 0) {
                      setIntervalHours(
                        intervals.includes(intervalHours)
                          ? intervalHours
                          : intervals[0],
                      )
                    } else {
                      setIntervalHours(500)
                    }
                  }}
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
                  Дата проведения ТО
                </Text>
                <Input
                  type="date"
                  value={performedAt}
                  onChange={(e) => setPerformedAt(e.target.value)}
                  required
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Интервал ТО (м/ч)
                </Text>
                {chainIntervals.length > 0 ? (
                  <select
                    value={
                      chainIntervals.includes(intervalHours)
                        ? intervalHours
                        : chainIntervals[0]
                    }
                    onChange={(e) =>
                      setIntervalHours(parseInt(e.target.value, 10))
                    }
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--chakra-colors-border)",
                    }}
                  >
                    {chainIntervals.map((h) => (
                      <option key={h} value={h}>
                        {h} м/ч
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <Input
                      type="number"
                      min={1}
                      value={intervalHours}
                      onChange={(e) =>
                        setIntervalHours(
                          parseInt(e.target.value, 10) || 500,
                        )
                      }
                      size="sm"
                    />
                    <Text fontSize="xs" color="fg.muted" mt={1}>
                      Техника не привязана к цепочке ТО — укажите интервал
                      вручную
                    </Text>
                  </>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Моточасы на момент ТО (необязательно)
                </Text>
                <Input
                  type="number"
                  min={0}
                  value={engineHoursAtService}
                  onChange={(e) => setEngineHoursAtService(e.target.value)}
                  placeholder="—"
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1} fontWeight="medium">
                  Комментарий (необязательно)
                </Text>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="—"
                  size="sm"
                  rows={2}
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
            <Button variant="solid" size="sm" type="submit" loading={createMutation.isPending}>
              Создать
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export function PerformedMaintenanceList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["equipment", "all-maintenance-records"],
    queryFn: () => equipmentApi.allMaintenanceRecords({ limit: 500 }),
  })

  const records = data?.data ?? []
  const count = data?.count ?? 0

  const refreshList = () => {
    queryClient.invalidateQueries({
      queryKey: ["equipment", "all-maintenance-records"],
    })
  }

  if (isLoading) {
    return <Text color="fg.muted">Загрузка…</Text>
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Button variant="solid" size="sm" onClick={() => setCreateOpen(true)}>
          <Flex as="span" align="center" gap={2}>
            <Box as={FaPlus} />
            Создать заказ
          </Flex>
        </Button>
        {records.length > 0 && (
          <Text fontSize="sm" color="fg.muted">
            Всего записей: {count}
          </Text>
        )}
      </Flex>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refreshList}
      />

      {records.length === 0 ? (
        <Text color="fg.muted">
          Проведённых ТО пока нет. Нажмите «Создать заказ», чтобы добавить
          запись о проведённом ТО.
        </Text>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Техника</Table.ColumnHeader>
              <Table.ColumnHeader>Дата</Table.ColumnHeader>
              <Table.ColumnHeader>Интервал (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Моточасы на момент ТО</Table.ColumnHeader>
              <Table.ColumnHeader>Комментарий</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {records.map((r) => (
              <Table.Row
                key={r.id}
                cursor="pointer"
                _hover={{ bg: "gray.subtle" }}
                _active={{ bg: "gray.muted" }}
                onClick={() =>
                  navigate({
                    to: "/technique/equipment/$equipmentId",
                    params: { equipmentId: r.equipment_id },
                  })
                }
              >
                <Table.Cell>
                  <Text fontWeight="medium">{r.equipment_name || "—"}</Text>
                </Table.Cell>
                <Table.Cell>
                  {new Date(r.performed_at).toLocaleDateString("ru-RU")}
                </Table.Cell>
                <Table.Cell>{r.interval_hours}</Table.Cell>
                <Table.Cell>
                  {r.engine_hours_at_service != null
                    ? r.engine_hours_at_service
                    : "—"}
                </Table.Cell>
                <Table.Cell>{r.comment ?? "—"}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  )
}
