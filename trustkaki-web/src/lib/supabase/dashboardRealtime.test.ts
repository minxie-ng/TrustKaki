import { describe, expect, it, vi } from "vitest";
import { subscribeToDashboardChanges } from "./dashboardRealtime";

describe("dashboard Realtime subscription", () => {
  it("debounces queue and action events into an authoritative refresh", () => {
    vi.useFakeTimers();
    const handlers: Array<() => void> = [];
    const channel = {
      on: vi.fn((_type, _filter, handler) => {
        handlers.push(handler);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    const onChange = vi.fn();

    const subscription = subscribeToDashboardChanges({
      onChange,
      debounceMs: 100,
      client: client as never,
    });

    expect(channel.on).toHaveBeenCalledTimes(2);
    handlers[0]();
    handlers[1]();
    vi.advanceTimersByTime(99);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    subscription?.unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
    vi.useRealTimers();
  });
});
