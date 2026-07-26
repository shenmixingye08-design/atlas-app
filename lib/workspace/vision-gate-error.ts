import type { CommanderVisionGate } from "@/lib/commander/types";

/** Thrown when image-attached work is blocked before Artifact Engine. */
export class VisionGateClientError extends Error {
  readonly gate: CommanderVisionGate;

  constructor(gate: CommanderVisionGate) {
    super(gate.message || "画像の内容を解析できませんでした");
    this.name = "VisionGateClientError";
    this.gate = gate;
  }
}
