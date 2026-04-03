"use client"

import type * as React from "react"
import { forwardRef, useState } from "react"
import { FiEye, FiEyeOff } from "react-icons/fi"

import { InputWithIcon } from "@/components/ui/input-with-icon.tsx"
import { cn } from "@/lib/utils"

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
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            setVisible((v) => !v)
          }}
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      }
    />
  )
})
