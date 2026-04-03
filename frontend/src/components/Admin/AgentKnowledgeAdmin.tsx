import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { agentKnowledgeApi } from "@/api/agentKnowledge.ts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { cn } from "@/lib/utils.ts"

const QK = ["agent-knowledge-chunks"] as const

export function AgentKnowledgeAdmin() {
  const qc = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const { data, isPending } = useQuery({
    queryKey: QK,
    queryFn: () => agentKnowledgeApi.list(0, 200),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [source, setSource] = useState("manual")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const resetForm = () => {
    setTitle("")
    setContent("")
    setSource("manual")
  }

  const createMut = useMutation({
    mutationFn: () =>
      agentKnowledgeApi.create(
        {
          title: title.trim(),
          content: content.trim(),
          source: source.trim() || "manual",
        },
        true,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
      setCreateOpen(false)
      resetForm()
      showSuccessToast("Фрагмент добавлен")
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const editMut = useMutation({
    mutationFn: () =>
      agentKnowledgeApi.update(
        editId!,
        {
          title: title.trim(),
          content: content.trim(),
          source: source.trim() || "manual",
        },
        true,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
      setEditId(null)
      resetForm()
      showSuccessToast("Сохранено")
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const delMut = useMutation({
    mutationFn: (id: string) => agentKnowledgeApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
      setDeleteId(null)
      showSuccessToast("Удалено")
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const reindexOneMut = useMutation({
    mutationFn: (id: string) => agentKnowledgeApi.reindexOne(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK })
      showSuccessToast("Эмбеддинг обновлён")
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const reindexAllMut = useMutation({
    mutationFn: () => agentKnowledgeApi.reindexAll(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: QK })
      showSuccessToast(`Готово: успех ${r.success}, ошибок ${r.failed}`)
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const openEdit = (row: {
    id: string
    title: string
    content: string
    source: string
  }) => {
    setEditId(row.id)
    setTitle(row.title)
    setContent(row.content)
    setSource(row.source)
  }

  const editingRow = data?.data.find((r) => r.id === editId)

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Справочные тексты для RAG ассистента. Эмбеддинги — через
        OpenAI-совместимый API (например vLLM: <code>VLLM_EMBED_MODEL</code> /{" "}
        <code>LLM_EMBED_MODEL</code>, размерность 768 по умолчанию). Требуется
        Postgres с расширением pgvector.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            resetForm()
            setCreateOpen(true)
          }}
        >
          Новый фрагмент
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={reindexAllMut.isPending}
          onClick={() => reindexAllMut.mutate()}
        >
          Переиндексировать все
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm">Загрузка…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Заголовок</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Эмбеддинг</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[200px]">
                  <p className="truncate font-medium" title={row.title}>
                    {row.title}
                  </p>
                </TableCell>
                <TableCell>{row.source}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs",
                      row.embedding_ready
                        ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {row.embedding_ready ? "да" : "нет"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => openEdit(row)}
                    >
                      Изменить
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      loading={reindexOneMut.isPending}
                      onClick={() => reindexOneMut.mutate(row.id)}
                    >
                      Эмбеддинг
                    </Button>
                    <Button
                      size="xs"
                      variant="outlineDestructive"
                      onClick={() => setDeleteId(row.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DialogRoot
        open={createOpen}
        onOpenChange={(e) => setCreateOpen(e.open)}
        size="lg"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый фрагмент</DialogTitle>
            <DialogCloseTrigger />
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-sm">Заголовок</p>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-8"
                />
              </div>
              <div>
                <p className="mb-1 text-sm">Источник</p>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="h-8"
                />
              </div>
              <div>
                <p className="mb-1 text-sm">Текст</p>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="outline"
              loading={createMut.isPending}
              disabled={!title.trim() || !content.trim()}
              onClick={() => createMut.mutate()}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <DialogRoot
        open={Boolean(editId)}
        onOpenChange={(e) => {
          if (!e.open) {
            setEditId(null)
            resetForm()
          }
        }}
        size="lg"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактирование</DialogTitle>
            <DialogCloseTrigger />
          </DialogHeader>
          <DialogBody>
            {editingRow ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-sm">Заголовок</p>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm">Источник</p>
                  <Input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm">Текст</p>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={8}
                  />
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>
              Отмена
            </Button>
            <Button
              variant="outline"
              loading={editMut.isPending}
              disabled={!title.trim() || !content.trim()}
              onClick={() => editMut.mutate()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Удалить фрагмент?"
        description="Его нельзя будет восстановить."
        confirmLabel="Удалить"
        variant="danger"
        isLoading={delMut.isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        onConfirm={() => {
          if (deleteId) delMut.mutate(deleteId)
        }}
      />
    </div>
  )
}
