import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/** Контур в цвете `--primary`: единый стиль для вторичных действий (как «Добавить», отмена, экспорт). Не для удаления — см. `outlineDestructive`. */
const outlinePrimaryClasses =
  "border-2 border-primary bg-background !text-primary shadow-sm hover:bg-primary/12 hover:!text-primary focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/30"

/** База и варианты как в fastapi/full-stack-fastapi-template (shadcn + Tailwind v4). */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 dark:hover:bg-destructive/90",
        outline: outlinePrimaryClasses,
        outlineSky: outlinePrimaryClasses,
        /** Опасное действие (удаление и т.п.) — выраженный контур destructive */
        outlineDestructive:
          "border-2 border-destructive bg-background !text-destructive shadow-sm hover:bg-destructive/12 hover:!text-destructive focus-visible:border-destructive focus-visible:ring-[3px] focus-visible:ring-destructive/35 dark:focus-visible:ring-destructive/45",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3.5 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

type ShadcnVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
/** Совместимость с Chakra: solid → default, subtle → secondary */
type LegacyVariant = ShadcnVariant | "solid" | "subtle" | null | undefined

function mapVariant(v: LegacyVariant): ShadcnVariant {
  if (v === "solid") return "default"
  if (v === "subtle") return "secondary"
  return (v ?? "default") as ShadcnVariant
}

export type ButtonProps = React.ComponentProps<"button"> &
  Omit<VariantProps<typeof buttonVariants>, "variant" | "size"> & {
    variant?: LegacyVariant
    size?: VariantProps<typeof buttonVariants>["size"]
    loading?: boolean
    loadingText?: React.ReactNode
    /** Составной дочерний элемент (как в shadcn): ссылка, `Link` и т.п. Несовместимо с `loading`. */
    asChild?: boolean
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant: variantProp,
    size = "default",
    loading,
    loadingText,
    disabled,
    children,
    type = "button",
    asChild = false,
    ...props
  },
  ref,
) {
  const variant = mapVariant(variantProp)
  const useAsChild = Boolean(asChild) && !loading && !loadingText

  if (useAsChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        loading && !loadingText && "relative",
        className,
      )}
      disabled={Boolean(loading) || disabled}
      {...props}
    >
      {loading && !loadingText ? (
        <>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          </span>
          <span className="opacity-0">{children}</span>
        </>
      ) : loading && loadingText ? (
        <>
          <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
