/**
 * Детали заявки: основная информация, таймлайн (история статусов + комментарии), чек-лист, вложения.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sparePartsApi } from "@/api/spareParts.ts"
import {
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderDetailPublic,
  workOrdersApi,
} from "@/api/workOrders.ts"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { cn } from "@/lib/utils.ts"

export function WorkOrderDetailDrawer({
  workOrderId,
  open,
  onOpenChange,
}: {
  workOrderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useCustomToast()
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState("")
  const [newCheckItem, setNewCheckItem] = useState("")
  const [statusEditing, setStatusEditing] = useState(false)
  const [statusComment, setStatusComment] = useState("")

  const { data: order, isLoading } = useQuery({
    queryKey: ["work-order", workOrderId],
    queryFn: () => workOrdersApi.get(workOrderId),
    enabled: open && !!workOrderId,
  })

  const addCommentMutation = useMutation({
    mutationFn: (body: { body: string }) =>
      workOrdersApi.addComment(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
      setCommentText("")
    },
    onError: (e) =>
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const updateOrderMutation = useMutation({
    mutationFn: (body: { status?: string; status_comment?: string }) =>
      workOrdersApi.update(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
      queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      setStatusEditing(false)
      setStatusComment("")
    },
    onError: (e) =>
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const addChecklistMutation = useMutation({
    mutationFn: (body: { title: string }) =>
      workOrdersApi.addChecklistItem(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
      setNewCheckItem("")
    },
    onError: (e) =>
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const toggleCheckMutation = useMutation({
    mutationFn: ({
      itemId,
      completed,
    }: {
      itemId: string
      completed: boolean
    }) => workOrdersApi.updateChecklistItem(workOrderId, itemId, { completed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
    },
  })

  const addReservationMutation = useMutation({
    mutationFn: (body: { spare_part_id: string; quantity: number }) =>
      workOrdersApi.addPartReservation(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
    },
    onError: (e) =>
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const deleteReservationMutation = useMutation({
    mutationFn: (reservationId: string) =>
      workOrdersApi.deletePartReservation(workOrderId, reservationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
    },
    onError: (e) =>
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const addConsumptionMutation = useMutation({
    mutationFn: (body: { spare_part_id: string; quantity: number }) =>
      workOrdersApi.addPartConsumption(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
    },
    onError: (e) =>
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  if (!open) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-4 py-3 pr-10 text-left">
          <SheetTitle>
            {isLoading ? "Загрузка…" : (order?.title ?? "Заявка")}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {!order ? (
            <p className="text-muted-foreground">Загрузка…</p>
          ) : (
            <WorkOrderDetailContent
              order={order}
              commentText={commentText}
              setCommentText={setCommentText}
              onAddComment={() => {
                if (commentText.trim())
                  addCommentMutation.mutate({ body: commentText.trim() })
              }}
              addCommentLoading={addCommentMutation.isPending}
              statusEditing={statusEditing}
              setStatusEditing={setStatusEditing}
              statusComment={statusComment}
              setStatusComment={setStatusComment}
              onUpdateStatus={(status, comment) =>
                updateOrderMutation.mutate({
                  status,
                  status_comment: comment || undefined,
                })
              }
              newCheckItem={newCheckItem}
              setNewCheckItem={setNewCheckItem}
              onAddCheckItem={() => {
                if (newCheckItem.trim())
                  addChecklistMutation.mutate({ title: newCheckItem.trim() })
              }}
              addChecklistLoading={addChecklistMutation.isPending}
              onToggleCheck={(itemId, completed) =>
                toggleCheckMutation.mutate({ itemId, completed })
              }
              onAddReservation={(spare_part_id, quantity) =>
                addReservationMutation.mutate({ spare_part_id, quantity })
              }
              addReservationLoading={addReservationMutation.isPending}
              onDeleteReservation={(reservationId) =>
                deleteReservationMutation.mutate(reservationId)
              }
              deleteReservationLoading={deleteReservationMutation.isPending}
              onAddConsumption={(spare_part_id, quantity) =>
                addConsumptionMutation.mutate({ spare_part_id, quantity })
              }
              addConsumptionLoading={addConsumptionMutation.isPending}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function WorkOrderDetailContent({
  order,
  commentText,
  setCommentText,
  onAddComment,
  addCommentLoading,
  statusEditing,
  setStatusEditing,
  statusComment,
  setStatusComment,
  onUpdateStatus,
  newCheckItem,
  setNewCheckItem,
  onAddCheckItem,
  addChecklistLoading,
  onToggleCheck,
  onAddReservation,
  addReservationLoading,
  onDeleteReservation,
  deleteReservationLoading,
  onAddConsumption,
  addConsumptionLoading,
}: {
  order: WorkOrderDetailPublic
  commentText: string
  setCommentText: (v: string) => void
  onAddComment: () => void
  addCommentLoading: boolean
  statusEditing: boolean
  setStatusEditing: (v: boolean) => void
  statusComment: string
  setStatusComment: (v: string) => void
  onUpdateStatus: (status: string, comment?: string) => void
  newCheckItem: string
  setNewCheckItem: (v: string) => void
  onAddCheckItem: () => void
  addChecklistLoading: boolean
  onToggleCheck: (itemId: string, completed: boolean) => void
  onAddReservation: (spare_part_id: string, quantity: number) => void
  addReservationLoading: boolean
  onDeleteReservation: (reservationId: string) => void
  deleteReservationLoading: boolean
  onAddConsumption: (spare_part_id: string, quantity: number) => void
  addConsumptionLoading: boolean
}) {
  const statusLabel =
    WORK_ORDER_STATUS_LABELS[
      order.status as keyof typeof WORK_ORDER_STATUS_LABELS
    ] ?? order.status
  const priorityLabel =
    WORK_ORDER_PRIORITY_LABELS[
      order.priority as keyof typeof WORK_ORDER_PRIORITY_LABELS
    ] ?? order.priority

  const timeline: Array<{
    type: "status" | "comment"
    id: string
    date: string
    text: string
    user: string | null
  }> = [
    ...order.status_history.map((h) => ({
      type: "status" as const,
      id: h.id,
      date: h.created_at,
      text: `Статус: ${WORK_ORDER_STATUS_LABELS[h.to_status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? h.to_status}${h.comment ? ` — ${h.comment}` : ""}`,
      user: h.changed_by_email ?? null,
    })),
    ...order.comments.map((c) => ({
      type: "comment" as const,
      id: c.id,
      date: c.created_at,
      text: c.body,
      user: c.user_email ?? null,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-sm text-muted-foreground">Техника</p>
        <p className="font-medium">{order.equipment_name ?? "—"}</p>
      </div>
      {order.description && (
        <div>
          <p className="mb-1 text-sm text-muted-foreground">Описание</p>
          <p>{order.description}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Статус</p>
          {statusEditing ? (
            <div className="mt-1 flex flex-col gap-1">
              <Select
                value={order.status}
                onValueChange={(v) => onUpdateStatus(v, statusComment)}
                onOpenChange={(open) => {
                  if (!open) setStatusEditing(false)
                }}
              >
                <SelectTrigger className="h-8 max-w-[220px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-7 text-xs"
                placeholder="Комментарий к смене статуса"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 h-auto border-border bg-muted/50 py-0.5 text-xs font-normal"
              onClick={() => setStatusEditing(true)}
            >
              {statusLabel}
            </Button>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Приоритет</p>
          <span className="mt-1 inline-block rounded-md border border-border px-2 py-0.5 text-xs">
            {priorityLabel}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Исполнитель</p>
          <p className="mt-1 text-sm">{order.assigned_to_email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Срок</p>
          <p className="mt-1 text-sm">
            {order.due_at
              ? new Date(order.due_at).toLocaleDateString("ru-RU")
              : "—"}
          </p>
        </div>
      </div>

      <h3 className="font-heading text-sm font-semibold">Таймлайн</h3>
      <div className="flex flex-col gap-2">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет событий и комментариев.
          </p>
        ) : (
          timeline.map((item) => (
            <div
              key={item.id}
              className="border-l-2 border-blue-200 py-1 pl-3 dark:border-blue-800"
            >
              <p className="text-xs text-muted-foreground">
                {new Date(item.date).toLocaleString("ru-RU")}
                {item.user ? ` · ${item.user}` : ""}
              </p>
              <p className="text-sm">{item.text}</p>
            </div>
          ))
        )}
        <div className="mt-2 flex gap-2">
          <Input
            className="h-7"
            placeholder="Добавить комментарий"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <Button
            size="sm"
            onClick={onAddComment}
            loading={addCommentLoading}
            disabled={!commentText.trim()}
          >
            Отправить
          </Button>
        </div>
      </div>

      <h3 className="font-heading text-sm font-semibold">Чек-лист</h3>
      <div className="flex flex-col gap-2">
        {order.checklist_items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <Checkbox
              checked={item.completed}
              onCheckedChange={(c) => onToggleCheck(item.id, Boolean(c))}
            />
            <span
              className={cn(
                item.completed && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            className="h-7"
            placeholder="Новый пункт"
            value={newCheckItem}
            onChange={(e) => setNewCheckItem(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onAddCheckItem}
            loading={addChecklistLoading}
            disabled={!newCheckItem.trim()}
          >
            Добавить
          </Button>
        </div>
      </div>

      {order.attachments.length > 0 && (
        <>
          <h3 className="font-heading text-sm font-semibold">Вложения</h3>
          <div className="flex flex-col gap-1">
            {order.attachments.map((a) => (
              <p key={a.id} className="text-sm">
                <a href={a.file_path} target="_blank" rel="noopener noreferrer">
                  {a.filename || a.file_path}
                </a>
                {a.kind !== "attachment" && (
                  <span className="ml-2 rounded-md border border-border px-2 py-0.5 text-xs">
                    {a.kind === "before_photo" ? "До" : "После"}
                  </span>
                )}
              </p>
            ))}
          </div>
        </>
      )}

      <h3 className="font-heading text-sm font-semibold">Резерв запчастей</h3>
      <PartReservationsSection
        reservations={order.part_reservations ?? []}
        onAddReservation={onAddReservation}
        addReservationLoading={addReservationLoading}
        onDeleteReservation={onDeleteReservation}
        deleteReservationLoading={deleteReservationLoading}
      />

      <h3 className="font-heading text-sm font-semibold">Списание по заявке</h3>
      <PartConsumptionsSection
        consumptions={order.part_consumptions ?? []}
        onAddConsumption={onAddConsumption}
        addConsumptionLoading={addConsumptionLoading}
      />
    </div>
  )
}

function PartReservationsSection({
  reservations,
  onAddReservation,
  addReservationLoading,
  onDeleteReservation,
  deleteReservationLoading,
}: {
  reservations: WorkOrderDetailPublic["part_reservations"]
  onAddReservation: (spare_part_id: string, quantity: number) => void
  addReservationLoading: boolean
  onDeleteReservation: (reservationId: string) => void
  deleteReservationLoading: boolean
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sparePartId, setSparePartId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const { data: partsData } = useQuery({
    queryKey: ["spare-parts", "for-reservation"],
    queryFn: () => sparePartsApi.list({ limit: 500 }),
    enabled: dialogOpen,
  })
  const parts = partsData?.data ?? []
  const list = reservations ?? []
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sparePartId || quantity < 1) return
    onAddReservation(sparePartId, quantity)
    setDialogOpen(false)
    setSparePartId("")
    setQuantity(1)
  }
  return (
    <div className="flex flex-col gap-2">
      {list.length > 0 ? (
        list.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2">
            <p className="text-sm">
              {r.spare_part_title ?? "—"}{" "}
              {r.spare_part_sku ? `(${r.spare_part_sku})` : ""} — {r.quantity}{" "}
              шт.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDeleteReservation(r.id)}
              loading={deleteReservationLoading}
            >
              Снять
            </Button>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Резервов нет</p>
      )}
      <DialogRoot open={dialogOpen} onOpenChange={(e) => setDialogOpen(e.open)}>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          Добавить резерв
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Резерв запчасти</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-sm font-medium">Запчасть</p>
                  <Select
                    value={toSelectAll(sparePartId)}
                    onValueChange={(v) => setSparePartId(fromSelectAll(v))}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder="Запчасть" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_ALL_VALUE}>
                        — Выберите —
                      </SelectItem>
                      {parts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title} {p.sku ? `(${p.sku})` : ""} — остаток{" "}
                          {p.quantity}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">Количество</p>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(parseInt(e.target.value, 10) || 1)
                    }
                    className="h-7"
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button type="submit" size="sm" loading={addReservationLoading}>
                Зарезервировать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  )
}

function PartConsumptionsSection({
  consumptions,
  onAddConsumption,
  addConsumptionLoading,
}: {
  consumptions: WorkOrderDetailPublic["part_consumptions"]
  onAddConsumption: (spare_part_id: string, quantity: number) => void
  addConsumptionLoading: boolean
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sparePartId, setSparePartId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const { data: partsData } = useQuery({
    queryKey: ["spare-parts", "for-consumption"],
    queryFn: () => sparePartsApi.list({ limit: 500 }),
    enabled: dialogOpen,
  })
  const parts = partsData?.data ?? []
  const list = consumptions ?? []
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sparePartId || quantity < 1) return
    onAddConsumption(sparePartId, quantity)
    setDialogOpen(false)
    setSparePartId("")
    setQuantity(1)
  }
  return (
    <div className="flex flex-col gap-2">
      {list.length > 0 ? (
        list.map((c) => (
          <p key={c.id} className="text-sm">
            {c.spare_part_title ?? "—"}{" "}
            {c.spare_part_sku ? `(${c.spare_part_sku})` : ""} — {c.quantity} шт.
            ({new Date(c.consumed_at).toLocaleString("ru")})
          </p>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Списаний нет</p>
      )}
      <DialogRoot open={dialogOpen} onOpenChange={(e) => setDialogOpen(e.open)}>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          Списать
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Списание запчасти по заявке</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-sm font-medium">Запчасть</p>
                  <Select
                    value={toSelectAll(sparePartId)}
                    onValueChange={(v) => setSparePartId(fromSelectAll(v))}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder="Запчасть" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_ALL_VALUE}>
                        — Выберите —
                      </SelectItem>
                      {parts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title} {p.sku ? `(${p.sku})` : ""} — остаток{" "}
                          {p.quantity}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">Количество</p>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(parseInt(e.target.value, 10) || 1)
                    }
                    className="h-7"
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button type="submit" size="sm" loading={addConsumptionLoading}>
                Списать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  )
}
