import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { CategoriesService } from "@/client/index.ts"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { ShortId } from "@/components/Common/ShortId.tsx"
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
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

function AddCategory() {
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState<string>("")
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })
  const create = useMutation({
    mutationFn: () =>
      CategoriesService.createCategory({
        requestBody: { name, parent_id: parentId || null },
      }),
    onSuccess: () => {
      setName("")
      setParentId("")
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось создать категорию",
      )
    },
  })
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Новая категория"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
      />
      <Select
        value={toSelectAll(parentId)}
        onValueChange={(v) => setParentId(fromSelectAll(v))}
      >
        <SelectTrigger className="h-8 min-w-[140px] text-sm">
          <SelectValue placeholder="Родитель" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SELECT_ALL_VALUE}>— Категории —</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outlineSky"
        size="sm"
        onClick={() => create.mutate()}
        disabled={!name.trim()}
        loading={create.isPending}
      >
        Добавить категорию
      </Button>
    </div>
  )
}

function EditCategory({
  category,
  categories,
}: {
  category: { id: string; name: string; parent_id?: string | null }
  categories: Array<{ id: string; name: string; parent_id?: string | null }>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(category.name)
  const [parentId, setParentId] = useState(category.parent_id ?? "")
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const update = useMutation({
    mutationFn: () =>
      CategoriesService.updateCategory({
        id: category.id,
        requestBody: { name: name || undefined, parent_id: parentId || null },
      }),
    onSuccess: () => {
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось обновить категорию",
      )
    },
  })
  const parentOpts = categories.filter((c) => c.id !== category.id)

  const onOpen = () => {
    setName(category.name)
    setParentId(category.parent_id ?? "")
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
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          role="presentation"
        >
          <div
            className="min-w-[280px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-3 font-bold">Редактировать категорию</p>
            <div className="mb-4 flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                className="h-7 text-sm"
              />
              <Select
                value={toSelectAll(parentId)}
                onValueChange={(v) => setParentId(fromSelectAll(v))}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Родитель" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_ALL_VALUE}>
                    — Категории —
                  </SelectItem>
                  {parentOpts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

function CategoriesList() {
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })
  const parentMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  const deleteCat = useMutation({
    mutationFn: (id: string) => CategoriesService.deleteCategory({ id }),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось удалить категорию",
      )
    },
  })

  if (categories.length === 0) return null
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Категории</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>
                  {c.parent_id
                    ? (parentMap[c.parent_id] ?? <ShortId id={c.parent_id} />)
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <EditCategory category={c} categories={categories} />
                    <Button
                      size="xs"
                      variant="outlineDestructive"
                      onClick={() =>
                        setDeleteConfirm({ id: c.id, name: c.name })
                      }
                      disabled={deleteCat.isPending}
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
        title="Удалить категорию?"
        description={
          deleteConfirm
            ? `Удалить «${deleteConfirm.name}»? Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteCat.isPending}
        onConfirm={() => deleteConfirm && deleteCat.mutate(deleteConfirm.id)}
      />
    </>
  )
}

export function AdminCategories() {
  return (
    <AdminPanel
      mt={4}
      title="Категории"
      description="Иерархия категорий для товаров склада."
    >
      <AddCategory />
      <CategoriesList />
    </AdminPanel>
  )
}
