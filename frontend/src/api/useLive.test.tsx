import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_INTERVAL_MS, parseVersion, useLive } from "./useLive";

// ---------- In-file mocks ----------

/** A fake EventSource the test controls. Mirrors the parts of the browser API we use. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  private listeners = new Map<string, (event: MessageEvent<string>) => void>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  // Test helpers
  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  fail(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }

  send(type: string, data: string): void {
    this.listeners.get(type)?.({ data } as MessageEvent<string>);
  }
}

/** fetch that answers GET /version with the next number from a list. */
function mockVersionFetch(versions: number[]): ReturnType<typeof vi.fn> {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const version = versions[Math.min(call, versions.length - 1)];
    call += 1;
    return new Response(JSON.stringify({ version }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useLive", () => {
  it("uses the SSE stream and reports each new version once", () => {
    mockVersionFetch([0]);
    const onVersion = vi.fn();
    const { result } = renderHook(() => useLive("event-abc", onVersion));
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe("/api/live/event-abc/stream");
    act(() => source.open());
    expect(result.current).toBe("live");
    act(() => source.send("version", '{"version": 3}'));
    act(() => source.send("version", "3")); // a repeat must not reach the page
    act(() => source.send("version", "4"));
    expect(onVersion.mock.calls).toEqual([[3], [4]]);
  });

  it("falls back to polling /version every 2 seconds when SSE fails", async () => {
    const fetchMock = mockVersionFetch([7, 7, 8]);
    const onVersion = vi.fn();
    const { result } = renderHook(() => useLive("event-abc", onVersion));
    act(() => FakeEventSource.instances[0].fail());
    expect(result.current).toBe("polling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // the first poll runs straight away
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/live/event-abc/version", expect.anything());
    expect(onVersion.mock.calls).toEqual([[7]]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); // same version: no callback
    });
    expect(onVersion.mock.calls).toEqual([[7]]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(onVersion.mock.calls).toEqual([[7], [8]]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("polls when the browser has no EventSource at all", async () => {
    vi.stubGlobal("EventSource", undefined);
    mockVersionFetch([1]);
    const onVersion = vi.fn();
    const { result } = renderHook(() => useLive("venue-xyz-2026-11-10", onVersion));
    expect(result.current).toBe("polling");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onVersion).toHaveBeenCalledWith(1);
  });

  it("stops polling when the component unmounts", async () => {
    const fetchMock = mockVersionFetch([1]);
    const { unmount } = renderHook(() => useLive("event-abc", vi.fn()));
    act(() => FakeEventSource.instances[0].fail());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    const callsAtUnmount = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(callsAtUnmount);
  });
});

describe("parseVersion", () => {
  it("accepts a bare number or an object, and rejects anything else", () => {
    expect(parseVersion("5")).toBe(5);
    expect(parseVersion('{"version": 6}')).toBe(6);
    expect(parseVersion("hello")).toBeNull();
    expect(parseVersion('{"v": 1}')).toBeNull();
  });
});
