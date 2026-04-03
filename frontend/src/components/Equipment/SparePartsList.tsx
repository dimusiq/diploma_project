/**
 * Запчасти: таблица с минимальными остатками и алертами (остаток <= min_quantity).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiAlertTriangle, FiPlus } from "react-icons/fi"
import { type SparePartCreate, type SparePartPublic, sparePartsApi } from "@/api/spareParts.ts"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
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
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

const PER_PAGE = 20

function isBelowMin(part: SparePartPublic): boolean {
  const min = part.min_quantity
  if (min == null) return false
  return part.quantity <= min
}

export function SparePartsList() {
  const toast = useCustomToast()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<SparePartCreate>({
    title: "",
    sku: "",
    description: "",
    quantity: 0,
    min_quantity: undefined,
    unit: "",
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["spare-parts", page, alertsOnly],
    queryFn: () =>
      sparePartsApi.list({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        below_min: alertsOnly || undefined,
        sort_by: "title",
        sort_order: "asc",
      }),
    // При переключении "Только алерты" / "Все позиции" и пагинации
    // держим предыдущие данные на экране, чтобы список не прыгал.
    placeholderData: (prev) => prev,
  })

  const createMutation = useMutation({
    mutationFn: (body: SparePartCreate) => sparePartsApi.create(body),
    onSuccess: () => {
      toast.showSuccessToast("Запчасть добавлена")
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] })
      setCreateOpen(false)
      setForm({ title: "", sku: "", description: "", quantity: 0, min_quantity: undefined, unit: "" })
    },
    onError: (e) => toast.showErrorToast(e instanceof Error ? e.message : "Ошибка"),
  })

  const parts = data?.data ?? []
  const count = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(count / PER_PAGE))

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.showErrorToast("Введите название")
      return
    }
    createMutation.mutate({
      title: form.title.trim(),
      sku: form.sku?.trim() || null,
      description: form.description?.trim() || null,
      quantity: form.quantity ?? 0,
      min_quantity: form.min_quantity != null ? form.min_quantity : null,
      unit: form.unit?.trim() || null,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
        >
          <span className="inline-flex items-center gap-1.5">
            <FiPlus />
            Добавить запчасть
          </span>
        </Button>
        <Button
          size="sm"
          variant={alertsOnly ? "default" : "outline"}
          onClick={() => {
            setAlertsOnly(true)
            setPage(1)
          }}
        >
          Только алерты (ниже мин. остатка)
        </Button>
        <Button
          size="sm"
          variant={alertsOnly ? "outline" : "default"}
          onClick={() => {
            setAlertsOnly(false)
            setPage(1)
          }}
        >
          Все позиции
        </Button>
      </div>

      <DialogRoot open={createOpen} onOpenChange={(e) => setCreateOpen(e.open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить запчасть</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Название *
                  </p>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Название запчасти"
                    className="h-7"
                    maxLength={255}
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Артикул
                  </p>
                  <Input
                    value={form.sku ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="Артикул"
                    className="h-7"
                    maxLength={64}
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Описание
                  </p>
                  <Input
                    value={form.description ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Описание"
                    className="h-7"
                    maxLength={512}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-sm font-medium">
                      Остаток
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={form.quantity ?? 0}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 0 }))}
                      className="h-7"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-sm font-medium">
                      Мин. остаток (алерт)
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={form.min_quantity ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          min_quantity: e.target.value === "" ? undefined : parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      placeholder="—"
                      className="h-7"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-sm font-medium">
                      Ед. изм.
                    </p>
                    <Input
                      value={form.unit ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="шт."
                      className="h-7"
                      maxLength={32}
                    />
                  </div>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(false)}>
                Отмена
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={createMutation.isPending}
                disabled={!form.title.trim()}
              >
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>

      <FetchingIndicator active={isFetching && !!data} />

      {isLoading && !data ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : parts.length === 0 ? (
        <p className="text-muted-foreground">
          {alertsOnly
            ? "Нет позиций с остатком ниже минимального."
            : "Нет запчастей на складе запчастей. Добавьте позиции."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Артикул</TableHead>
                <TableHead className="text-end">Остаток</TableHead>
                <TableHead className="text-end">Мин. остаток</TableHead>
                <TableHead>Ед.</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((part) => {
                const alert = isBelowMin(part)
                return (
                  <TableRow key={part.id}>
                    <TableCell className="font-medium">{part.title}</TableCell>
                    <TableCell className="text-muted-foreground">{part.sku ?? "—"}</TableCell>
                    <TableCell className="text-end">{part.quantity}</TableCell>
                    <TableCell className="text-end">
                      {part.min_quantity != null ? part.min_quantity : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{part.unit ?? "—"}</TableCell>
                    <TableCell>
                      {alert ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                          <FiAlertTriangle />
                          Ниже минимума
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Норма
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          page={page}
          onPageChange={(e) => setPage(e.page)}
        >
          <div className="flex items-center gap-2">
            <PaginationPrevTrigger asChild>
              <Button size="sm" variant="outline">
                Назад
              </Button>
            </PaginationPrevTrigger>
            <PaginationItems />
            <PaginationNextTrigger asChild>
              <Button size="sm" variant="outline">
                Вперёд
              </Button>
            </PaginationNextTrigger>
          </div>
        </PaginationRoot>
      )}
    </div>
  )
}
