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
    <output
      className="block bg-orange-500 px-4 py-2 text-center text-sm text-white"
      aria-live="polite"
    >
      <p className="font-medium">Нет соединения с интернетом</p>
    </output>
  )
}
