const listeners = new Set<(deviceId: string) => void>()
const STORAGE_KEY = "twin-camera-follow"

export function requestAgvCameraView(deviceId: string): void {
  sessionStorage.setItem(STORAGE_KEY, deviceId)
  for (const listener of listeners) listener(deviceId)
}

export function subscribeAgvCameraView(listener: (deviceId: string) => void): () => void {
  listeners.add(listener)
  const pending = sessionStorage.getItem(STORAGE_KEY)
  if (pending) listener(pending)
  return () => {
    listeners.delete(listener)
  }
}

export function consumeAgvCameraView(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
