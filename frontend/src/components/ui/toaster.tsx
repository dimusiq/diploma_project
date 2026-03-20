"use client"

import {
  Toaster as ChakraToaster,
  createToaster,
  Portal,
  Spinner,
  Toast,
  Alert,
  Box,
} from "@chakra-ui/react"

export const toaster = createToaster({
  placement: "top-end",
  pauseOnPageIdle: true,
})

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }} padding={0}>
            {toast.type === "loading" ? (
              <Box p={3}>
                <Spinner size="sm" color="cyan.solid" />
              </Box>
            ) : (
              (() => {
                const status =
                  toast.type === "success"
                    ? "success"
                    : toast.type === "error"
                      ? "error"
                      : "info"

                return (
                  <Alert.Root
                    status={status as any}
                    variant="subtle"
                    borderRadius="md"
                    width="100%"
                  >
                    <Alert.Indicator />
                    <Alert.Content>
                      {toast.title ? <Alert.Title>{toast.title}</Alert.Title> : null}
                      {toast.description ? (
                        <Alert.Description>{toast.description}</Alert.Description>
                      ) : null}
                    </Alert.Content>
                  </Alert.Root>
                )
              })()
            )}
            {toast.action && (
              <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
            )}
            {toast.meta?.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  )
}
