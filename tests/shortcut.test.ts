import { describe, expect, it, vi } from "vitest";
import { ACCELERATOR, GlobalToggleBinding } from "../src/shortcut";
function api(occupied = false, accepted = true) {
  return { isRegistered: vi.fn(() => occupied), register: vi.fn(() => accepted), unregister: vi.fn() };
}
describe("global shortcut ownership", () => {
  it("registers exactly one OS shortcut and releases only that key", () => {
    const bridge = api();
    const binding = new GlobalToggleBinding(bridge);
    const toggle = vi.fn();
    binding.register(toggle);
    binding.register(toggle);
    expect(bridge.register).toHaveBeenCalledTimes(1);
    expect(bridge.register).toHaveBeenCalledWith(ACCELERATOR, toggle);
    binding.dispose();
    binding.dispose();
    expect(bridge.unregister).toHaveBeenCalledTimes(1);
    expect(bridge.unregister).toHaveBeenCalledWith(ACCELERATOR);
  });
  it("does not steal or unregister another vault's shortcut", () => {
    const bridge = api(true);
    const binding = new GlobalToggleBinding(bridge);
    expect(() => binding.register(vi.fn())).toThrow("已被");
    binding.dispose();
    expect(bridge.register).not.toHaveBeenCalled();
    expect(bridge.unregister).not.toHaveBeenCalled();
  });
  it("reports OS refusal without releasing another application's key", () => {
    const bridge = api(false, false);
    const binding = new GlobalToggleBinding(bridge);
    expect(() => binding.register(vi.fn())).toThrow("注册失败");
    binding.dispose();
    expect(bridge.unregister).not.toHaveBeenCalled();
  });
});
