import { Box, Text } from "@chakra-ui/react"
import { useEffect, useState } from "react"

export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  )

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  if (online) return null

  return (
    <Box
      bg="orange.500"
      color="white"
      py={2}
      px={4}
      textAlign="center"
      fontSize="sm"
      role="status"
      aria-live="polite"
    >
      <Text fontWeight="medium">Нет соединения с интернетом</Text>
    </Box>
  )
}
