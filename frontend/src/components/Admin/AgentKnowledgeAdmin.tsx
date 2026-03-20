import {
  Badge,
  Box,
  Button,
  Flex,
  Input,
  Table,
  Text,
  Textarea,
} from "@chakra-ui/react"
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
} from "@/components/ui/dialog.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

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
        { title: title.trim(), content: content.trim(), source: source.trim() || "manual" },
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
        { title: title.trim(), content: content.trim(), source: source.trim() || "manual" },
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

  const openEdit = (row: { id: string; title: string; content: string; source: string }) => {
    setEditId(row.id)
    setTitle(row.title)
    setContent(row.content)
    setSource(row.source)
  }

  const editingRow = data?.data.find((r) => r.id === editId)

  return (
    <Box pt={4}>
      <Text fontSize="sm" color="fg.muted" mb={4}>
        Справочные тексты для RAG ассистента. Эмбеддинги — через Ollama (
        <code>OLLAMA_EMBED_MODEL</code>, размерность 768). Требуется Postgres с
        расширением pgvector.
      </Text>
      <Flex gap={2} mb={4} flexWrap="wrap">
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true) }}>
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
      </Flex>

      {isPending ? (
        <Text fontSize="sm">Загрузка…</Text>
      ) : (
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Заголовок</Table.ColumnHeader>
              <Table.ColumnHeader>Источник</Table.ColumnHeader>
              <Table.ColumnHeader>Эмбеддинг</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Действия</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data?.data.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell maxW="200px">
                  <Text fontWeight="medium" truncate title={row.title}>
                    {row.title}
                  </Text>
                </Table.Cell>
                <Table.Cell>{row.source}</Table.Cell>
                <Table.Cell>
                  <Badge colorPalette={row.embedding_ready ? "green" : "gray"}>
                    {row.embedding_ready ? "да" : "нет"}
                  </Badge>
                </Table.Cell>
                <Table.Cell textAlign="right">
                  <Flex gap={1} justify="flex-end" flexWrap="wrap">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(row)}
                    >
                      Изменить
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      loading={reindexOneMut.isPending}
                      onClick={() => reindexOneMut.mutate(row.id)}
                    >
                      Эмбеддинг
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => setDeleteId(row.id)}
                    >
                      Удалить
                    </Button>
                  </Flex>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
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
            <Flex direction="column" gap={3}>
              <Box>
                <Text fontSize="sm" mb={1}>
                  Заголовок
                </Text>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1}>
                  Источник
                </Text>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  size="sm"
                />
              </Box>
              <Box>
                <Text fontSize="sm" mb={1}>
                  Текст
                </Text>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  size="sm"
                />
              </Box>
            </Flex>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
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
              <Flex direction="column" gap={3}>
                <Box>
                  <Text fontSize="sm" mb={1}>
                    Заголовок
                  </Text>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    size="sm"
                  />
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1}>
                    Источник
                  </Text>
                  <Input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    size="sm"
                  />
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1}>
                    Текст
                  </Text>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={8}
                    size="sm"
                  />
                </Box>
              </Flex>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>
              Отмена
            </Button>
            <Button
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
    </Box>
  )
}
