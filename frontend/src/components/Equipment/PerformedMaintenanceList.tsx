/**
 * Общий список проведённых ТО для раздела «Обслуживание и ремонт техники».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FaPlus } from "react-icons/fa"

import { equipmentApi, type MaintenanceRecordCreate } from "@/api/equipment.ts"
import {
  apiChainToLegacyFormat,
  maintenanceScheduleApi,
} from "@/api/maintenanceSchedule.ts"
import { fetchSimFleet, SIM_FLEET_QUERY_KEY } from "@/api/simFleet.ts"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
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
    if (chainIntervals.length > 0 && !chainIntervals.includes(intervalHours)) {
      setIntervalHours(chainIntervals[0])
    }
  }, [chainIntervals, intervalHours])

  const { data: equipmentData } = useQuery({
    queryKey: SIM_FLEET_QUERY_KEY,
    queryFn: () => fetchSimFleet(false),
    enabled: open,
  })
  const equipmentList = equipmentData?.data ?? []

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
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-sm font-medium">Техника</p>
                <Select
                  value={toSelectAll(equipmentId)}
                  onValueChange={(v) => {
                    const id = fromSelectAll(v)
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
                        {eq.name} ({eq.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                {chainIntervals.length > 0 ? (
                  <Select
                    value={String(
                      chainIntervals.includes(intervalHours)
                        ? intervalHours
                        : chainIntervals[0],
                    )}
                    onValueChange={(v) => setIntervalHours(parseInt(v, 10))}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {chainIntervals.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {h} м/ч
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input
                      type="number"
                      min={1}
                      value={intervalHours}
                      onChange={(e) =>
                        setIntervalHours(parseInt(e.target.value, 10) || 500)
                      }
                      className="h-7"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Техника не привязана к цепочке ТО — укажите интервал
                      вручную
                    </p>
                  </>
                )}
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
              size="sm"
              type="submit"
              variant="outline"
              loading={createMutation.isPending}
            >
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
    return <p className="text-muted-foreground">Загрузка…</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="outlineSky" size="sm" onClick={() => setCreateOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <FaPlus />
            Создать заказ
          </span>
        </Button>
        {records.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Всего записей: {count}
          </p>
        )}
      </div>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refreshList}
      />

      {records.length === 0 ? (
        <p className="text-muted-foreground">
          Проведённых ТО пока нет. Нажмите «Создать заказ», чтобы добавить
          запись о проведённом ТО.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Техника</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Интервал (м/ч)</TableHead>
              <TableHead>Моточасы на момент ТО</TableHead>
              <TableHead>Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/equipment/$deviceId",
                    params: { deviceId: r.equipment_id },
                  })
                }
              >
                <TableCell>
                  <span className="font-medium">{r.equipment_name || "—"}</span>
                </TableCell>
                <TableCell>
                  {new Date(r.performed_at).toLocaleDateString("ru-RU")}
                </TableCell>
                <TableCell>{r.interval_hours}</TableCell>
                <TableCell>
                  {r.engine_hours_at_service != null
                    ? r.engine_hours_at_service
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {r.comment ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
