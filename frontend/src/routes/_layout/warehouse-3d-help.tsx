import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { Button } from "@/components/ui/button.tsx"

export const Route = createFileRoute("/_layout/warehouse-3d-help")({
  component: Warehouse3DHelpPage,
})

const EXPIRING_DAYS = 30

function Warehouse3DHelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Button asChild size="xs" variant="outline" className="font-medium">
          <RouterLink to="/warehouse">Склад</RouterLink>
        </Button>
        <FiChevronRight className="size-3 shrink-0" aria-hidden />
        <Button asChild size="xs" variant="outline" className="font-medium">
          <RouterLink to="/warehouse-3d">3D Склад</RouterLink>
        </Button>
        <FiChevronRight className="size-3 shrink-0" aria-hidden />
        <span>Справка</span>
      </div>

      <h1 className="mb-4 font-heading text-2xl font-semibold tracking-tight">
        Справка: 3D модель склада
      </h1>

      <div className="max-w-none space-y-6 text-sm text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Ячейки и данные
          </h2>
          <p>
            Ячейки заполняются при добавлении товара с выбранной ячейкой. Клик
            по ячейке открывает карточку; <strong>Escape</strong> закрывает её.
            Красная подсветка — срок годности в пределах {EXPIRING_DAYS}{" "}
            дней; тёмно-красная — просрочка. Симуляция техники и маршрут —
            только визуализация, позиции товаров в БД не меняются.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Легенда цветов ячеек
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Серый — пусто</li>
            <li>Синий — занято</li>
            <li>Красный — срок истекает</li>
            <li>Тёмно-красный — просрочено</li>
            <li>Жёлтый — выбрано</li>
            <li>Оранжевый — маршрут</li>
            <li>Фиолетовый — блок / буфер (ряд)</li>
            <li>Янтарный — резерв (отгрузка)</li>
            <li>Тёмно-фиолетовый — карантин / приёмка</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Управление камерой
          </h2>
          <p>
            <strong>Орбита:</strong> левая кнопка мыши — вращение; колёсико —
            масштаб; правая кнопка или Shift+ЛКМ — панорама.
          </p>
          <p>
            <strong>Свободная камера:</strong> WASD или стрелки — движение
            (включая наклон взгляда); зажать мышь и двигать — поворот; колёсико
            — вперёд/назад; Space — вверх; Shift — вниз.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Маршрут</h2>
          <p>
            В обычном режиме <strong>Shift+клик</strong> по ячейке добавляет
            точку маршрута. Режим «Маршрут» на вкладке панели: клики по ячейкам
            по порядку; попап ячейки отключён, точки отображаются оранжевой
            линией на полу. Для запуска симуляции нужно не менее двух точек.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Digital twin (вкладка Twin)
          </h2>
          <p>
            Зоны и проходы берутся из топологии склада. Граф маршрутов — из{" "}
            <code className="rounded bg-muted px-1 text-foreground">
              GET /warehouse/route-graph
            </code>
            . Heatmap и аномалии считаются в браузере. Слайдер «Снимок данных»
            переключает локальные снимки списка товаров (обновляются примерно
            раз в 12 с).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            На телефоне
          </h2>
          <p>
            Панель «Сцена / Маршрут / Twin» открывается снизу кнопкой «Панель».
            Выбранная вкладка запоминается в этом браузере.
          </p>
        </section>

        <Button asChild variant="default">
          <RouterLink to="/warehouse-3d">Вернуться к 3D</RouterLink>
        </Button>
      </div>
    </div>
  )
}
