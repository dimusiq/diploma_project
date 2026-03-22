/**
 * Шина сообщений twin SSE (один поток в layout → подписчики на страницах).
 */

export type TwinConnectionStatus =
  | "idle"
  | "no_token"
  | "connecting"
  | "live"
  | "offline"

export type TwinStreamEnvelope = {
  v?: number
  channel?: string
  type?: string
  ts?: string
  payload?: Record<string, unknown>
}

const MAX_RING = 40

let _status: TwinConnectionStatus = "idle"
const _statusListeners = new Set<(s: TwinConnectionStatus) => void>()
const _msgListeners = new Set<(m: TwinStreamEnvelope) => void>()
const _ring: TwinStreamEnvelope[] = []

function _emitStatus(s: TwinConnectionStatus) {
  _status = s
  for (const fn of _statusListeners) {
    try {
      fn(s)
    } catch {
      /* ignore */
    }
  }
}

function _pushRing(m: TwinStreamEnvelope) {
  _ring.push(m)
  if (_ring.length > MAX_RING) {
    _ring.splice(0, _ring.length - MAX_RING)
  }
}

export function getTwinConnectionStatus(): TwinConnectionStatus {
  return _status
}

export function getTwinRecentMessages(): readonly TwinStreamEnvelope[] {
  return [..._ring]
}

export function setTwinConnectionStatus(s: TwinConnectionStatus) {
  if (_status !== s) {
    _emitStatus(s)
  }
}

export function emitTwinStreamMessage(m: TwinStreamEnvelope) {
  _pushRing(m)
  for (const fn of _msgListeners) {
    try {
      fn(m)
    } catch {
      /* ignore */
    }
  }
}

export function subscribeTwinConnectionStatus(
  fn: (s: TwinConnectionStatus) => void,
): () => void {
  _statusListeners.add(fn)
  fn(_status)
  return () => {
    _statusListeners.delete(fn)
  }
}

export function subscribeTwinStreamMessages(
  fn: (m: TwinStreamEnvelope) => void,
): () => void {
  _msgListeners.add(fn)
  for (const m of _ring) {
    fn(m)
  }
  return () => {
    _msgListeners.delete(fn)
  }
}
