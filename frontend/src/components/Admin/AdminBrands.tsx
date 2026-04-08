import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { type BrandPublic, brandsApi } from "@/api/brands.ts"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

function AddBrand() {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const create = useMutation({
    mutationFn: () => brandsApi.create({ name: name.trim() }),
    onSuccess: () => {
      setName("")
      queryClient.invalidateQueries({ queryKey: ["brands"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось создать бренд",
      )
    },
  })
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Новый бренд техники"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
      />
      <Button
        variant="outlineSky"
        size="sm"
        onClick={() => create.mutate()}
        disabled={!name.trim()}
        loading={create.isPending}
      >
        Добавить бренд
      </Button>
    </div>
  )
}

function EditBrand({ brand }: { brand: BrandPublic }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(brand.name)
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const update = useMutation({
    mutationFn: () => brandsApi.update(brand.id, { name: name.trim() }),
    onSuccess: () => {
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось обновить бренд",
      )
    },
  })

  const onOpen = () => {
    setName(brand.name)
    setOpen(true)
  }

  return (
    <>
      <Button size="xs" variant="outline" onClick={onOpen}>
        Изменить
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="min-w-[280px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-3 font-bold">Редактировать бренд</p>
            <div className="mb-4 flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                className="h-7 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Отмена
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => update.mutate()}
                loading={update.isPending}
                disabled={!name.trim()}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BrandsList() {
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: () => brandsApi.list(),
  })
  const deleteBrand = useMutation({
    mutationFn: (id: string) => brandsApi.delete(id),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось удалить бренд",
      )
    },
  })

  if (brands.length === 0) return null
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.name}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <EditBrand brand={b} />
                    <Button
                      size="xs"
                      variant="outlineDestructive"
                      onClick={() =>
                        setDeleteConfirm({ id: b.id, name: b.name })
                      }
                      disabled={deleteBrand.isPending}
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Удалить бренд?"
        description={
          deleteConfirm
            ? `Удалить бренд «${deleteConfirm.name}»? К нему не должна быть привязана техника.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteBrand.isPending}
        onConfirm={() => deleteConfirm && deleteBrand.mutate(deleteConfirm.id)}
      />
    </>
  )
}

export function AdminBrands() {
  return (
    <AdminPanel
      title="Бренды техники"
      description="Справочник брендов для раздела «Техника». Создание и изменение — только для суперпользователя."
    >
      <AddBrand />
      <BrandsList />
    </AdminPanel>
  )
}
