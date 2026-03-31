/**
 * Диалог «Записать проведённое ТО» для одной единицы техники.
 */
import {
  Box,
  Button,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  type EquipmentPublic,
  equipmentApi,
  type MaintenanceRecordCreate,
} from "@/api/equipment.ts"
import { maintenanceScheduleApi } from "@/api/maintenanceSchedule.ts"
import { apiChainToLegacyFormat } from "@/api/maintenanceSchedule.ts"
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

export function EquipmentRecordMaintenanceDialog({
  equipment,
  open,
  onOpenChange,
  onSuccess,
}: {
  equipment: EquipmentPublic | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const toast = useCustomToast()
  const queryClient = useQueryClient()
  const [performedAt, setPerformedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [intervalHours, setIntervalHours] = useState(500)
  const [engineHoursAtService, setEngineHoursAtService] = useState("")
  const [comment, setComment] = useState("")

  const { data: chainsData } = useQuery({
    queryKey: ["maintenance-chains"],
    queryFn: () => maintenanceScheduleApi.listChains(),
    enabled: open && !!equipment,
  })
  const chains = (chainsData?.data ?? []).map(apiChainToLegacyFormat)
  const chainIntervals = equipment
    ? getIntervalHoursForEquipment(equipment.id, chains)
    : []

  useEffect(() => {
    if (open && chainIntervals.length > 0 && !chainIntervals.includes(intervalHours)) {
      setIntervalHours(chainIntervals[0])
    }
  }, [open, chainIntervals, intervalHours])

  const createMutation = useMutation({
    mutationFn: (body: MaintenanceRecordCreate) =>
      equipment
        ? equipmentApi.createMaintenanceRecord(equipment.id, body)
        : Promise.reject(new Error("Техника не выбрана")),
    onSuccess: () => {
      toast.showSuccessToast("Проведённое ТО записано")
      onSuccess()
      onOpenChange(false)
      setEngineHoursAtService("")
      setComment("")
      queryClient.invalidateQueries({
        queryKey: ["equipment-maintenance-records", equipment?.id],
      })
      queryClient.invalidateQueries({ queryKey: ["equipment", "all-maintenance-records"] })
    },
    onError: (err) => {
      toast.showErrorToast(
        err instanceof Error ? err.message : "Что-то пошло не так.",
      )
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipment) return
    createMutation.mutate({
      performed_at: performedAt,
      interval_hours: intervalHours,
      engine_hours_at_service: engineHoursAtService.trim()
        ? parseInt(engineHoursAtService, 10)
        : undefined,
      comment: comment.trim() || undefined,
    })
  }

  if (!equipment) return null

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      placement="center"
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogCloseTrigger />
          <DialogHeader>
            <DialogTitle>
              Записать проведённое ТО — {equipment.brand_name} {equipment.model}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={3} align="stretch">
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
                <select
                  value={intervalHours}
                  onChange={(e) =>
                    setIntervalHours(parseInt(e.target.value, 10) || 500)
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--chakra-colors-border)",
                    minWidth: "120px",
                    fontSize: "14px",
                  }}
                >
                  {(chainIntervals.length ? chainIntervals : [500, 1000, 1500]).map(
                    (h) => (
                      <option key={h} value={h}>
                        {h} м/ч
                      </option>
                    ),
                  )}
                </select>
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
            <Button
              variant="solid"
              type="submit"
              size="sm"
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
            >
              Записать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
