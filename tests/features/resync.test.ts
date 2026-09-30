import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChannelRecoveryTracker, createResyncScheduler } from "@/features/online/resync";

describe("createResyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lance la première demande tout de suite", () => {
    const run = vi.fn();
    createResyncScheduler(run, 1000).request();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fond une rafale en un appel immédiat plus un seul rattrapage", () => {
    const run = vi.fn();
    const scheduler = createResyncScheduler(run, 1000);
    scheduler.request(); // online
    vi.advanceTimersByTime(100);
    scheduler.request(); // visibilitychange
    scheduler.request(); // SUBSCRIBED
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(899);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("repart immédiatement une fois la fenêtre écoulée", () => {
    const run = vi.fn();
    const scheduler = createResyncScheduler(run, 1000);
    scheduler.request();
    vi.advanceTimersByTime(1000);
    scheduler.request();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("n'appelle plus rien après dispose", () => {
    const run = vi.fn();
    const scheduler = createResyncScheduler(run, 1000);
    scheduler.request();
    scheduler.request();
    scheduler.dispose();
    vi.advanceTimersByTime(5000);
    scheduler.request();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("createChannelRecoveryTracker", () => {
  it("ignore le premier SUBSCRIBED", () => {
    const recovered = createChannelRecoveryTracker();
    expect(recovered("SUBSCRIBED")).toBe(false);
  });

  it("signale un SUBSCRIBED qui suit une rupture, une seule fois", () => {
    for (const rupture of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) {
      const recovered = createChannelRecoveryTracker();
      recovered("SUBSCRIBED");
      expect(recovered(rupture)).toBe(false);
      expect(recovered("SUBSCRIBED")).toBe(true);
      expect(recovered("SUBSCRIBED")).toBe(false);
    }
  });
});
