import { describe, expect, it } from "vitest";

import {
  MOTION_MS,
  MOTION_SCALE,
  MOTION_SPRING_SOFT,
  MOTION_STAGGER_CAP,
  MOTION_Y,
  pageTravelY,
} from "@/lib/motion/tokens";

describe("motion tokens", () => {
  it("keeps tap / page / modal durations in the visible ranges", () => {
    expect(MOTION_MS.tap).toBeGreaterThanOrEqual(100);
    expect(MOTION_MS.tap).toBeLessThanOrEqual(160);
    expect(MOTION_MS.base).toBeGreaterThanOrEqual(160);
    expect(MOTION_MS.base).toBeLessThanOrEqual(280);
    expect(MOTION_MS.page).toBeGreaterThanOrEqual(240);
    expect(MOTION_MS.page).toBeLessThanOrEqual(320);
    expect(MOTION_MS.modal).toBeGreaterThanOrEqual(200);
    expect(MOTION_MS.modal).toBeLessThanOrEqual(320);
    expect(MOTION_MS.complete).toBeGreaterThanOrEqual(800);
    expect(MOTION_MS.complete).toBeLessThanOrEqual(1100);
    expect(MOTION_MS.number).toBeGreaterThanOrEqual(160);
    expect(MOTION_MS.number).toBeLessThanOrEqual(220);
  });

  it("keeps tap scale and enter travel large enough to see", () => {
    expect(MOTION_SCALE.tap).toBeGreaterThanOrEqual(0.95);
    expect(MOTION_SCALE.tap).toBeLessThanOrEqual(0.965);
    expect(MOTION_SCALE.tapNav).toBeGreaterThanOrEqual(0.93);
    expect(MOTION_SCALE.tapNav).toBeLessThanOrEqual(0.95);
    expect(MOTION_SCALE.page).toBe(0.985);
    expect(MOTION_SCALE.home).toBe(0.98);
    expect(MOTION_Y.page).toBeGreaterThanOrEqual(14);
    expect(MOTION_Y.page).toBeLessThanOrEqual(18);
    expect(MOTION_Y.home).toBeGreaterThanOrEqual(16);
    expect(MOTION_Y.home).toBeLessThanOrEqual(22);
    expect(MOTION_Y.card).toBeGreaterThanOrEqual(18);
    expect(MOTION_Y.card).toBeLessThanOrEqual(22);
    expect(MOTION_Y.complete).toBeGreaterThanOrEqual(22);
    expect(MOTION_Y.complete).toBeLessThanOrEqual(26);
    expect(MOTION_Y.modal).toBe(32);
    expect(pageTravelY(true)).toBeGreaterThanOrEqual(10);
    expect(pageTravelY(false)).toBe(MOTION_Y.page);
  });

  it("staggers home sections and uses a damped spring", () => {
    expect(MOTION_MS.stagger).toBeGreaterThanOrEqual(60);
    expect(MOTION_MS.stagger).toBeLessThanOrEqual(80);
    expect(MOTION_STAGGER_CAP).toBeLessThanOrEqual(8);
    expect(MOTION_SPRING_SOFT.damping).toBeGreaterThan(MOTION_SPRING_SOFT.stiffness / 14);
  });
});
