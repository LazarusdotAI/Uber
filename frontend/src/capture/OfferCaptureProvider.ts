// OfferCaptureProvider — platform-agnostic interface for offer capture.
//
// IMPORTANT / SAFETY: Cross-platform Expo/React Native CANNOT read the screen
// of another app (Uber Eats / DoorDash / Grubhub). That requires a native OS
// capability (Android AccessibilityService / MediaProjection, iOS Broadcast /
// ScreenTime style extensions) shipped in a custom native build. This module
// defines the clean contract so those native modules can be plugged in later
// WITHOUT changing the scoring engine or the rest of the app. The scoring
// engine only consumes a normalized RawOffer — it never depends on HOW the
// offer was captured (manual, screenshot scan, or a future live module).

export type CaptureStatus = "idle" | "starting" | "listening" | "stopped" | "unsupported" | "error";

export type RawOffer = {
  platform?: string;
  payout?: number | null;
  miles?: number | null;
  minutes?: number | null;
  restaurant?: string | null;
  dropoff_area?: string | null;
  stops?: number | null;
  capture_method: "manual" | "scan" | "live";
};

export type OfferDetectedHandler = (offer: RawOffer) => void;
export type StatusHandler = (status: CaptureStatus) => void;

export interface OfferCaptureProvider {
  readonly id: string;
  readonly available: boolean;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  onOfferDetected(handler: OfferDetectedHandler): () => void;
  onStatusChange(handler: StatusHandler): () => void;
  captureStatus(): CaptureStatus;
  // Emit a detected offer through the pipeline. A native module calls this
  // when it parses a real on-screen offer; the demo screen uses it to show
  // the end-to-end auto-scoring UX transparently.
  simulate?(offer: RawOffer): void;
}

// Default provider used in Expo Go / web / any build without a native capture
// module. It is intentionally a no-op that reports `unsupported` — the app
// falls back to Scan + Manual entry. A real native module registers itself via
// `registerCaptureProvider(...)`.
class NoopCaptureProvider implements OfferCaptureProvider {
  readonly id = "noop";
  readonly available = false;
  private status: CaptureStatus = "unsupported";
  private offerHandlers = new Set<OfferDetectedHandler>();
  private statusHandlers = new Set<StatusHandler>();

  async startCapture() {
    this.setStatus("unsupported");
  }
  async stopCapture() {
    this.setStatus("stopped");
  }
  onOfferDetected(handler: OfferDetectedHandler) {
    this.offerHandlers.add(handler);
    return () => this.offerHandlers.delete(handler);
  }
  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }
  captureStatus() {
    return this.status;
  }
  private setStatus(s: CaptureStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }
  // exposed for a native bridge to emit detections when one exists later
  _emit(offer: RawOffer) {
    this.offerHandlers.forEach((h) => h(offer));
  }
  simulate(offer: RawOffer) {
    this._emit(offer);
  }
}

let activeProvider: OfferCaptureProvider = new NoopCaptureProvider();

export function registerCaptureProvider(provider: OfferCaptureProvider) {
  activeProvider = provider;
}

export function getCaptureProvider(): OfferCaptureProvider {
  return activeProvider;
}

// Route a detected offer through the active provider's handlers. Used by the
// native bridge (real detections) and by the Live Capture demo.
export function simulateDetection(offer: RawOffer) {
  if (typeof activeProvider.simulate === "function") {
    activeProvider.simulate(offer);
  }
}
