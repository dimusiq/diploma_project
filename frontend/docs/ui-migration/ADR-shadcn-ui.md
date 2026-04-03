# ADR: миграция UI на Tailwind + shadcn/ui

## Контекст

Текущий UI строится на **Chakra UI v3** (`@chakra-ui/react`), кастомная тема в `src/theme.tsx`, обёртки в `src/components/ui/`. Цель — перейти на подход, согласованный с экосистемой shadcn/ui и с [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template) (Tailwind CSS, shadcn/ui, типичный набор примитивов на базе Radix UI).

## Решение (целевая архитектура)

| Слой | Выбор |
|------|--------|
| Стили | **Tailwind CSS** |
| Примитивы | **shadcn/ui** (копируемые компоненты в репозиторий, не npm-пакет «как есть») |
| Варианты | **class-variance-authority (cva)** |
| Классы | Утилита **`cn()`** (обычно `clsx` + `tailwind-merge`) |

Импорты примитивов — из `@/components/ui/*` (или принятого в проекте алиаса), без прямого смешения Chakra и shadcn в одном листинге компонента после миграции файла.

## Правила замены

### Variant / Size

- Chakra `colorPalette`, `variant`, `size` → **пропсы `variant` и `size`**, реализованные через **cva** в обёртке компонента (как в shadcn Button).
- Не переносить «как есть» семантику Chakra: составить **таблицу соответствия** (см. [CHAKRA-SHADCN-MAPPING.md](./CHAKRA-SHADCN-MAPPING.md)) и при необходимости добавить проектные варианты (`default`, `destructive`, `outline`, …).

### Тема и токены

- Глобальные цвета и радиусы — через **CSS variables** в `:root` / `.dark`, генерируемые Tailwind/shadcn theme (например `hsl(var(--primary))`).
- Текущие токены из `theme.tsx` (например `ui.main`, `semantic.*`) **маппятся** на переменные shadcn/Tailwind; дублирование источников истины не допускается.
- Кастомный акцент приложения фиксируется один раз в конфиге темы и переменных.

### Dark mode

- Уже используется **`next-themes`** — оставить для переключения темы.
- Корневой узел: `ThemeProvider` из `next-themes` + класс **`dark`** на `document`/`html` (совместимо с Tailwind `dark:` и shadcn).
- Убрать зависимость от Chakra `ColorModeProvider` / `chakra-theme` после миграции обёрток в `color-mode.tsx` и провайдера.

### Toast

- Chakra `createToaster` / `Toaster` → **sonner** (рекомендуемая связка с shadcn) **или** компонент Toast из shadcn — **один** выбранный вариант на весь проект.
- API: статичные хелперы `toast.success/error/...` с единым `Toaster` в корне layout.

### Dialog

- Chakra `Dialog` → shadcn **Dialog** (Radix Dialog): `DialogTrigger` / `DialogContent` / `DialogHeader` / `DialogFooter` или композиция по паттерну из шаблона FastAPI.
- Управление открытием: контролируемое состояние React; для подтверждений — переиспользуемый `AlertDialog`-паттерн из shadcn (если добавлен).

## Отклонения от шаблона FastAPI

Допускаются, если зафиксированы в mapping-документе: например, Sonner vs shadcn Toast, кастомные варианты кнопок под бренд.

## Ссылки

- [Full Stack FastAPI Template — frontend stack](https://github.com/fastapi/full-stack-fastapi-template)
- [shadcn/ui](https://ui.shadcn.com/)
