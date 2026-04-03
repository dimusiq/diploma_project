/**
 * Диалог «Записать проведённое ТО» для одной единицы техники.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea.tsx"
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
    if (
      open &&
      chainIntervals.length > 0 &&
      !chainIntervals.includes(intervalHours)
    ) {
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
      queryClient.invalidateQueries({
        queryKey: ["equipment", "all-maintenance-records"],
      })
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
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-sm font-medium">Дата проведения ТО</p>
                <Input
                  type="date"
                  value={performedAt}
                  onChange={(e) => setPerformedAt(e.target.value)}
                  required
                  className="h-7"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Интервал ТО (м/ч)</p>
                <Select
                  value={String(intervalHours)}
                  onValueChange={(v) =>
                    setIntervalHours(parseInt(v, 10) || 500)
                  }
                >
                  <SelectTrigger className="h-9 min-w-[120px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(chainIntervals.length
                      ? chainIntervals
                      : [500, 1000, 1500]
                    ).map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h} м/ч
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Моточасы на момент ТО (необязательно)
                </p>
                <Input
                  type="number"
                  min={0}
                  value={engineHoursAtService}
                  onChange={(e) => setEngineHoursAtService(e.target.value)}
                  placeholder="—"
                  className="h-7"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  Комментарий (необязательно)
                </p>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="—"
                  rows={2}
                  className="min-h-[4rem] text-sm"
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
