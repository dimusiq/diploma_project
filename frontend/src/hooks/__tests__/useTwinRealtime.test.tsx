import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import { removeAccessToken, setAccessToken } from "@/lib/authStorage.ts"
import {
  subscribeTwinConnectionStatus,
  type TwinConnectionStatus,
} from "@/lib/twinRealtimeBus.ts"
import { TWIN_CHANNELS_ALL, type TwinChannel, useTwinRealtime } from "../useTwinRealtime"

function HookRunner({ options }: { options?: Parameters<typeof useTwinRealtime>[0] }) {
  useTwinRealtime(options)
  return null
}

function renderWithProviders(options?: Parameters<typeof useTwinRealtime>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <HookRunner options={options} />
    </QueryClientProvider>,
  )
}

describe("useTwinRealtime", () => {
  let fetchSpy: Mock
  let statusLog: TwinConnectionStatus[]
  let unsubscribe: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    statusLog = []
    unsubscribe = subscribeTwinConnectionStatus((s) => statusLog.push(s))

    fetchSpy = vi.fn().mockResolvedValue({ ok: false, body: null })
    vi.stubGlobal("fetch", fetchSpy)

    removeAccessToken()
  })

  afterEach(() => {
    unsubscribe()
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    removeAccessToken()
  })

  it("exports TWIN_CHANNELS_ALL with expected channels", () => {
    expect(TWIN_CHANNELS_ALL).toContain("occupancy")
    expect(TWIN_CHANNELS_ALL).toContain("item_movement")
    expect(TWIN_CHANNELS_ALL).toContain("alerts")
    expect(TWIN_CHANNELS_ALL).toContain("telemetry")
    expect(TWIN_CHANNELS_ALL).toContain("equipment_positions")
    expect(TWIN_CHANNELS_ALL).toHaveLength(7)
  })

  it("sets status to no_token when there is no access token", async () => {
    renderWithProviders()
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(statusLog).toContain("no_token")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("calls fetch with correct URL when token exists", async () => {
    setAccessToken("test-token", false)

    renderWithProviders()
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(statusLog).toContain("connecting")
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain("/api/v1/twin/stream")
    expect(url).toContain("channels=*")
    expect(url).toContain("replay_seconds=120")
    expect(opts.headers).toEqual({ Authorization: "Bearer test-token" })
  })

  it("passes custom channels to the URL", async () => {
    setAccessToken("test-token", false)

    const channels: readonly TwinChannel[] = ["occupancy", "alerts"]
    renderWithProviders({ channels })
    await act(() => vi.advanceTimersByTimeAsync(0))

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain("channels=occupancy%2Calerts")
  })

  it("passes custom replaySeconds to the URL", async () => {
    setAccessToken("test-token", false)

    renderWithProviders({ replaySeconds: 60 })
    await act(() => vi.advanceTimersByTimeAsync(0))

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain("replay_seconds=60")
  })

  it("sets status to offline on failed fetch", async () => {
    setAccessToken("test-token", false)

    renderWithProviders()
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(statusLog).toContain("offline")
  })

  it("aborts connection on unmount", async () => {
    setAccessToken("test-token", false)

    const { unmount } = renderWithProviders()
    await act(() => vi.advanceTimersByTimeAsync(0))

    const fetchCountBefore = fetchSpy.mock.calls.length
    unmount()

    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(fetchSpy.mock.calls.length).toBe(fetchCountBefore)
  })

  it("schedules reconnect after failed fetch", async () => {
    setAccessToken("test-token", false)

    renderWithProviders()
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
