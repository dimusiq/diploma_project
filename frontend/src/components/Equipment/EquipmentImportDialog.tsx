import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ChangeEventHandler } from "react"
import { useEffect, useRef, useState } from "react"
import { FiUpload } from "react-icons/fi"

import {
  EQUIPMENT_TYPE_LABELS,
  type EquipmentImportResult,
  equipmentApi,
} from "@/api/equipment.ts"
import type { ApiError } from "@/client/core/ApiError.ts"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { handleError } from "@/utils.ts"

export function EquipmentImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastResult, setLastResult] = useState<EquipmentImportResult | null>(
    null,
  )
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [templateLoading, setTemplateLoading] = useState(false)

  useEffect(() => {
    if (open) setLastResult(null)
  }, [open])

  const mutation = useMutation({
    mutationFn: (file: File) => equipmentApi.importFromFile(file),
    onSuccess: (data) => {
      setLastResult(data)
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
      if (data.created > 0 && data.errors.length === 0) {
        showSuccessToast(`Добавлено единиц техники: ${data.created}`)
        onOpenChange(false)
        return
      }
      if (data.created > 0 && data.errors.length > 0) {
        showSuccessToast(
          `Добавлено: ${data.created}. Ошибок в строках: ${data.errors.length}`,
        )
        return
      }
      if (data.errors.length > 0) {
        showErrorToast("Не удалось добавить технику — см. список ошибок ниже")
      }
    },
    onError: (err: ApiError) => handleError(err),
  })

  const handlePick = () => inputRef.current?.click()

  const handleDownloadTemplate = async () => {
    setTemplateLoading(true)
    try {
      await equipmentApi.downloadImportTemplate()
    } catch (err) {
      handleError(err as ApiError)
    } finally {
      setTemplateLoading(false)
    }
  }

  const handleFile: ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      showErrorToast("Выберите файл в формате .xlsx")
      return
    }
    mutation.mutate(f)
  }

  const typeHint = Object.entries(EQUIPMENT_TYPE_LABELS)
    .map(([id, ru]) => `${ru} (${id})`)
    .join(", ")

  return (
    <DialogRoot
      open={open}
      onOpenChange={(ev) => onOpenChange(ev.open)}
      size={{ base: "sm", md: "md" }}
      placement="center"
    >
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Импорт техники из Excel</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Первый лист файла: первая строка — заголовки. Обязательные
              столбцы: <strong>тип техники</strong>, <strong>бренд</strong> (как
              в справочнике или UUID), <strong>модель</strong>. Формат файла:{" "}
              <strong>.xlsx</strong> (Excel 2007 и новее).
            </p>
            <p className="text-xs text-muted-foreground">
              Тип: код ({typeHint}) или русское название. Опционально: VIN,
              серийный номер, гаражный номер, дата ввода, моточасы, состояние,
              зона и др. — см. подписи в форме добавления техники.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto min-h-0 self-start px-0 font-normal underline"
              loading={templateLoading}
              onClick={() => void handleDownloadTemplate()}
            >
              Скачать шаблон (.xlsx)
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handlePick}
              loading={mutation.isPending}
            >
              <FiUpload className="mr-2 size-4" />
              Выбрать файл…
            </Button>
            {lastResult && lastResult.errors.length > 0 ? (
              <div className="max-h-[200px] overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                <p className="mb-1 font-medium">
                  Ошибки по строкам (номер строки в файле):
                </p>
                {lastResult.errors.map((e) => (
                  <p
                    key={`${e.row}-${e.message}`}
                    className="text-muted-foreground"
                  >
                    Стр. {e.row}: {e.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-wrap gap-2">
            <DialogActionTrigger asChild>
              <Button variant="outline" size="sm">
                Закрыть
              </Button>
            </DialogActionTrigger>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
