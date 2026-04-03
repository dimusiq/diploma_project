# Маппинг компонентов: Chakra UI → shadcn/ui

Ориентир по структуре примитивов и паттернам: [full-stack-fastapi-template / frontend](https://github.com/fastapi/full-stack-fastapi-template/tree/master/frontend) (Tailwind, shadcn, `cn`, типичные обёртки над Radix).

## Таблица соответствий

| Chakra UI (v3) | shadcn / стек | Заметки |
|----------------|---------------|---------|
| **Button** (`Button`, обёртка `components/ui/button`) | **Button** | `variant`: `default` \| `destructive` \| `outline` \| `secondary` \| `ghost` \| `link`; `size`: `default` \| `sm` \| `lg` \| `icon`. Loading: обёртка с `Loader2` / спиннером, как сейчас в кастомном Button. |
| **Input** | **Input** | Маски и `react-hook-form`: `Form`, `FormField`, `FormItem`, `FormControl` (shadcn forms). |
| **Field** (лейбл, ошибка, хелп) | **Label** + **Form** primitives | Один стиль полей по проекту; `Field.ErrorText` → `FormMessage`. |
| **Dialog** (`DialogRoot`, `DialogContent`, …) | **Dialog** | Портал и focus trap из Radix; замена `DialogBackdrop` → встроенный overlay в `DialogContent`. |
| **Drawer** | **Sheet** | В shadcn боковая панель — `Sheet` (Radix Dialog с `side`). Анимации и `side` задать по UX текущего Drawer. |
| **Menu** | **DropdownMenu** | `MenuTrigger` → `DropdownMenuTrigger`; пункты — `DropdownMenuItem`, разделители — `DropdownMenuSeparator`. |
| **Tabs** | **Tabs** | `Tabs.List` / `Tabs.Trigger` / `Tabs.Content` → `TabsList`, `TabsTrigger`, `TabsContent`. |
| **Table** | **Table** | Обёртки `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`; для data-heavy экранов сохранить семантику `thead`/`tbody`. |
| **Toaster** / `toast.*` | **Sonner** *или* **Toast** (shadcn) | Выбрать один вариант в ADR; Sonner часто быстрее внедрить и совместим с Tailwind. |
| **Checkbox** | **Checkbox** | Состояние indeterminate при необходимости через проп Radix. |
| **RadioGroup** / **Radio** | **RadioGroup** | Группа и подписи по паттерну shadcn. |
| **Popover** | **Popover** | Совместимо по модели триггер + контент. |
| **Card** | **Card** | `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`. |
| **Skeleton** | **Skeleton** | Единая длительность/радиус через токены. |
| **Pagination** (кастом) | **Pagination** (shadcn) или композиция **Button** | Сохранить текущее API страниц, если обёртка уже абстрагирует логику. |

### Layout и типографика (не из «коробки» shadcn)

| Chakra | Целевой подход |
|--------|----------------|
| `Box`, `Flex`, `Stack`, `VStack`, `HStack` | `div` + Tailwind (`flex`, `gap-*`, `grid`, …) или лёгкие локальные обёртки без Chakra. |
| `Text`, `Heading` | Семантические `p`, `h1`–`h6` + утилиты Tailwind (`text-sm`, `font-medium`, …). |
| `Container` | `div` + `mx-auto max-w-* px-*`. |
| `Splitter` | Оценить **resizable** из shadcn или оставить отдельную зависимость только для этого кейса. |

## Технические решения: тема и токены

| Тема | Решение |
|------|---------|
| Источник цветов | CSS variables в `globals.css` (или аналог), согласованные с [Tailwind theme extension](https://tailwindcss.com/docs/theme) и shadcn. |
| Акцент (`ui.main` и др.) | Одна переменная `--primary` (или проектное имя) + производные для hover/focus. |
| Семантика (`success`, `warning`, `error`, `info`) | Переменные `--semantic-*` или маппинг на chart/статус-классы Tailwind; не смешивать с `--chakra-colors-*`. |
| Радиусы и шрифты | `--radius`, семейство шрифтов в `:root`; синхронизация с `tailwind.config`. |
| Dark | `class="dark"` на `html` + `next-themes` `attribute="class"`; палитра в `.dark { ... }`. |

## Definition of Done

Миграция считается **готовой к развитию** (для снятия [UI-freeze](./UI-FREEZE.md)), когда выполнено:

1. **Документы:** утверждены и актуальны этот mapping, [ADR](./ADR-shadcn-ui.md), правила заморозки.
2. **Стек:** в `package.json` подключены Tailwind, `tailwind-merge`, `clsx`, `class-variance-authority`; базовые примитивы shadcn лежат в `src/components/ui/`.
3. **Тема:** зафиксированы токены (светлая/тёмная), нет новых обязательных обращений к `var(--chakra-colors-*)` в новом коде; таблица маппинга старых токенов на новые добавлена в этот файл или в `ADR` (кратко).
4. **Глобальные оболочки:** `Provider` / layout переведены на shadcn + `next-themes`; toaster — единый компонент в корне.
5. **Критические потоки:** вход, настройки, хотя бы один сложный диалог/таблица переведены как **эталон** для остальных экранов.

После этого новые фичи в UI делаются только на целевом стеке; оставшийся Chakra-код мигрируется итерациями по модулям.
