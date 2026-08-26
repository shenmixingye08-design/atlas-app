import { describe, expect, it } from "vitest";

import {
  MOTION_MS,
  MOTION_SCALE,
  MOTION_SPRING_SOFT,
  MOTION_STAGGER_CAP,
  MOTION_Y,
} from "@/lib/motion/tokens";

describe("motion tokens", () => {
  it("keeps tap / page / modal durations in the agreed ranges", () => {
    expect(MOTION_MS.tap).toBeGreaterThanOrEqual(100);
    expect(MOTION_MS.tap).toBeLessThanOrEqual(160);
    expect(MOTION_MS.base).toBeGreaterThanOrEqual(160);
    expect(MOTION_MS.base).toBeLessThanOrEqual(280);
    expect(MOTION_MS.page).toBeGreaterThanOrEqual(200);
    expect(MOTION_MS.page).toBeLessThanOrEqual(320);
    expect(MOTION_MS.modal).toBeGreaterThanOrEqual(200);
    expect(MOTION_MS.modal).toBeLessThanOrEqual(320);
    expect(MOTION_MS.complete).toBeGreaterThanOrEqual(500);
    expect(MOTION_MS.complete).toBeLessThanOrEqual(700);
    expect(MOTION_MS.number).toBeGreaterThanOrEqual(160);
    expect(MOTION_MS.number).toBeLessThanOrEqual(220);
  });

  it("keeps tap scale and enter travel conservative", () => {
    expect(MOTION_SCALE.tap).toBeGreaterThanOrEqual(0.97);
    expect(MOTION_SCALE.tap).toBeLessThanOrEqual(0.985);
    expect(MOTION_SCALE.tapCard).toBeGreaterThanOrEqual(0.97);
    expect(MOTION_SCALE.tapCard).toBeLessThanOrEqual(0.985);
    expect(MOTION_Y.page).toBeGreaterThanOrEqual(4);
    expect(MOTION_Y.page).toBeLessThanOrEqual(8);
    expect(MOTION_Y.card).toBeGreaterThanOrEqual(6);
    expect(MOTION_Y.card).toBeLessThanOrEqual(10);
  });

  it("caps list stagger and uses a damped spring", () => {
    expect(MOTION_MS.stagger).toBeGreaterThanOrEqual(30);
    expect(MOTION_MS.stagger).toBeLessThanOrEqual(60);
    expect(MOTION_STAGGER_CAP).toBeLessThanOrEqual(8);
    expect(MOTION_SPRING_SOFT.damping).toBeGreaterThan(MOTION_SPRING_SOFT.stiffness / 14);
  });
});
