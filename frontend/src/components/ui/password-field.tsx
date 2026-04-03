"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import type * as React from "react"
import { forwardRef, useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import { InputWithIcon } from "@/components/ui/input-with-icon.tsx"

type InputProps = React.ComponentProps<"input">

export const PasswordField = forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type"> & {
    startElement?: React.ReactNode
    className?: string
    inputClassName?: string
  }
>(function PasswordField(
  { startElement, className, inputClassName, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  return (
    <InputWithIcon
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      className={className}
      inputClassName={inputClassName}
      startElement={startElement}
      endElement={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          className="size-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            setVisible((v) => !v)
          }}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      }
    />
  )
})
