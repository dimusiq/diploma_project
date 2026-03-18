/**
 * Детали заявки: основная информация, таймлайн (история статусов + комментарии), чек-лист, вложения.
 */
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import {
  workOrdersApi,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderDetailPublic,
} from "@/api/workOrders.ts"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { sparePartsApi } from "@/api/spareParts.ts"

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
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
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
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const addChecklistMutation = useMutation({
    mutationFn: (body: { title: string }) =>
      workOrdersApi.addChecklistItem(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
      setNewCheckItem("")
    },
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const toggleCheckMutation = useMutation({
    mutationFn: ({
      itemId,
      completed,
    }: { itemId: string; completed: boolean }) =>
      workOrdersApi.updateChecklistItem(workOrderId, itemId, { completed }),
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
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const deleteReservationMutation = useMutation({
    mutationFn: (reservationId: string) =>
      workOrdersApi.deletePartReservation(workOrderId, reservationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
    },
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const addConsumptionMutation = useMutation({
    mutationFn: (body: { spare_part_id: string; quantity: number }) =>
      workOrdersApi.addPartConsumption(workOrderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] })
    },
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  if (!open) return null

  return (
    <DrawerRoot open={open} onOpenChange={(e) => onOpenChange(e.open)} size="md" placement="end">
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerCloseTrigger />
        <DrawerHeader>
          <DrawerTitle>
            {isLoading ? "Загрузка…" : order?.title ?? "Заявка"}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody overflowY="auto" pb={6}>
          {!order ? (
            <Text color="fg.muted">Загрузка…</Text>
          ) : (
            <WorkOrderDetailContent
              order={order}
              commentText={commentText}
              setCommentText={setCommentText}
              onAddComment={() => {
                if (commentText.trim()) addCommentMutation.mutate({ body: commentText.trim() })
              }}
              addCommentLoading={addCommentMutation.isPending}
              statusEditing={statusEditing}
              setStatusEditing={setStatusEditing}
              statusComment={statusComment}
              setStatusComment={setStatusComment}
              onUpdateStatus={(status, comment) =>
                updateOrderMutation.mutate({ status, status_comment: comment || undefined })
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
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
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
  const statusLabel = WORK_ORDER_STATUS_LABELS[order.status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? order.status
  const priorityLabel = WORK_ORDER_PRIORITY_LABELS[order.priority as keyof typeof WORK_ORDER_PRIORITY_LABELS] ?? order.priority

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
    <VStack align="stretch" gap={6}>
      <Box>
        <Text fontSize="sm" color="fg.muted" mb={1}>
          Техника
        </Text>
        <Text fontWeight="medium">{order.equipment_name ?? "—"}</Text>
      </Box>
      {order.description && (
        <Box>
          <Text fontSize="sm" color="fg.muted" mb={1}>
            Описание
          </Text>
          <Text>{order.description}</Text>
        </Box>
      )}
      <Flex gap={2} flexWrap="wrap">
        <Box>
          <Text fontSize="xs" color="fg.muted">Статус</Text>
          {statusEditing ? (
            <VStack align="stretch" gap={1} mt={1}>
              <select
                defaultValue={order.status}
                onBlur={(e) => {
                  const v = e.target.value
                  if (v !== order.status) onUpdateStatus(v, statusComment)
                  setStatusEditing(false)
                }}
                onChange={(e) => onUpdateStatus(e.target.value, statusComment)}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--chakra-colors-border)",
                  fontSize: "13px",
                }}
              >
                {Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Input
                size="xs"
                placeholder="Комментарий к смене статуса"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
              />
            </VStack>
          ) : (
            <Badge
              cursor="pointer"
              onClick={() => setStatusEditing(true)}
              mt={1}
            >
              {statusLabel}
            </Badge>
          )}
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.muted">Приоритет</Text>
          <Badge mt={1}>{priorityLabel}</Badge>
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.muted">Исполнитель</Text>
          <Text fontSize="sm" mt={1}>{order.assigned_to_email ?? "—"}</Text>
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.muted">Срок</Text>
          <Text fontSize="sm" mt={1}>
            {order.due_at
              ? new Date(order.due_at).toLocaleDateString("ru-RU")
              : "—"}
          </Text>
        </Box>
      </Flex>

      <Heading size="sm">Таймлайн</Heading>
      <VStack align="stretch" gap={2}>
        {timeline.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">
            Пока нет событий и комментариев.
          </Text>
        ) : (
          timeline.map((item) => (
            <Box
              key={item.id}
              pl={3}
              borderLeftWidth="2px"
              borderLeftColor="blue.200"
              py={1}
            >
              <Text fontSize="xs" color="fg.muted">
                {new Date(item.date).toLocaleString("ru-RU")}
                {item.user ? ` · ${item.user}` : ""}
              </Text>
              <Text fontSize="sm">{item.text}</Text>
            </Box>
          ))
        )}
        <Flex gap={2} mt={2}>
          <Input
            size="sm"
            placeholder="Добавить комментарий"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <Button
            size="sm"
            variant="solid"
            onClick={onAddComment}
            loading={addCommentLoading}
            disabled={!commentText.trim()}
          >
            Отправить
          </Button>
        </Flex>
      </VStack>

      <Heading size="sm">Чек-лист</Heading>
      <VStack align="stretch" gap={2}>
        {order.checklist_items.map((item) => (
          <Flex key={item.id} align="center" gap={2}>
            <Checkbox
              checked={item.completed}
              onCheckedChange={(e) =>
                onToggleCheck(item.id, e.checked === true)
              }
            />
            <Text
              as="span"
              textDecoration={item.completed ? "line-through" : undefined}
              color={item.completed ? "fg.muted" : undefined}
            >
              {item.title}
            </Text>
          </Flex>
        ))}
        <Flex gap={2}>
          <Input
            size="sm"
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
        </Flex>
      </VStack>

      {order.attachments.length > 0 && (
        <>
          <Heading size="sm">Вложения</Heading>
          <VStack align="stretch" gap={1}>
            {order.attachments.map((a) => (
              <Text key={a.id} fontSize="sm">
                <a
                  href={a.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.filename || a.file_path}
                </a>
                {a.kind !== "attachment" && (
                  <Badge size="sm" ml={2}>
                    {a.kind === "before_photo" ? "До" : "После"}
                  </Badge>
                )}
              </Text>
            ))}
          </VStack>
        </>
      )}

      <Heading size="sm">Резерв запчастей</Heading>
      <PartReservationsSection
        reservations={order.part_reservations ?? []}
        onAddReservation={onAddReservation}
        addReservationLoading={addReservationLoading}
        onDeleteReservation={onDeleteReservation}
        deleteReservationLoading={deleteReservationLoading}
      />

      <Heading size="sm">Списание по заявке</Heading>
      <PartConsumptionsSection
        consumptions={order.part_consumptions ?? []}
        onAddConsumption={onAddConsumption}
        addConsumptionLoading={addConsumptionLoading}
      />
    </VStack>
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
    <VStack align="stretch" gap={2}>
      {list.length > 0 ? (
        list.map((r) => (
          <Flex key={r.id} justify="space-between" align="center" gap={2}>
            <Text fontSize="sm">
              {r.spare_part_title ?? "—"} {r.spare_part_sku ? `(${r.spare_part_sku})` : ""} — {r.quantity} шт.
            </Text>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              onClick={() => onDeleteReservation(r.id)}
              loading={deleteReservationLoading}
            >
              Снять
            </Button>
          </Flex>
        ))
      ) : (
        <Text fontSize="sm" color="fg.muted">
          Резервов нет
        </Text>
      )}
      <DialogRoot open={dialogOpen} onOpenChange={(e) => setDialogOpen(e.open)}>
        <Button size="sm" variant="outline" colorPalette="blue" onClick={() => setDialogOpen(true)}>
          Добавить резерв
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Резерв запчасти</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <DialogBody>
              <VStack gap={3} align="stretch">
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Запчасть
                  </Text>
                  <select
                    value={sparePartId}
                    onChange={(e) => setSparePartId(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--chakra-colors-border)",
                    }}
                  >
                    <option value="">— Выберите —</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} {p.sku ? `(${p.sku})` : ""} — остаток {p.quantity}
                      </option>
                    ))}
                  </select>
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Количество
                  </Text>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    size="sm"
                  />
                </Box>
              </VStack>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" size="sm" variant="solid" colorPalette="blue" loading={addReservationLoading}>
                Зарезервировать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>
    </VStack>
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
    <VStack align="stretch" gap={2}>
      {list.length > 0 ? (
        list.map((c) => (
          <Text key={c.id} fontSize="sm">
            {c.spare_part_title ?? "—"} {c.spare_part_sku ? `(${c.spare_part_sku})` : ""} — {c.quantity} шт. (
            {new Date(c.consumed_at).toLocaleString("ru")})
          </Text>
        ))
      ) : (
        <Text fontSize="sm" color="fg.muted">
          Списаний нет
        </Text>
      )}
      <DialogRoot open={dialogOpen} onOpenChange={(e) => setDialogOpen(e.open)}>
        <Button size="sm" variant="outline" colorPalette="blue" onClick={() => setDialogOpen(true)}>
          Списать
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Списание запчасти по заявке</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <DialogBody>
              <VStack gap={3} align="stretch">
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Запчасть
                  </Text>
                  <select
                    value={sparePartId}
                    onChange={(e) => setSparePartId(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--chakra-colors-border)",
                    }}
                  >
                    <option value="">— Выберите —</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} {p.sku ? `(${p.sku})` : ""} — остаток {p.quantity}
                      </option>
                    ))}
                  </select>
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Количество
                  </Text>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    size="sm"
                  />
                </Box>
              </VStack>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" size="sm" variant="solid" colorPalette="blue" loading={addConsumptionLoading}>
                Списать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>
    </VStack>
  )
}
