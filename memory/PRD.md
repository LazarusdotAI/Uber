# GigVerdict — PRD & Build Log

## Original Problem Statement
Production-ready cross-platform (iOS + Android) Expo/React Native + FastAPI + MongoDB app: a real-time decision assistant for gig-delivery drivers (Uber Eats first, DoorDash/Grubhub-ready). For every offer it returns a glanceable 🟢 TAKE IT / 🟡 MAYBE / 🔴 DECLINE verdict with a 0–100 score and a WHY reasons list, plus shift tracking, zones/map, learning system, analytics, smart repositioning, settings/presets and a daily goal. Advisory only — never auto-accepts/declines or reads private Uber APIs.

## User Choices
- Vision model for screenshot scan: **GPT-5.6 Luna** (openai `gpt-5.6-luna` via emergentintegrations).
- Auth: **Emergent-managed Google OAuth**.
- Build all 8 feature areas in order; Verdict engine must show WHY reasons.
- Preload **rich demo data**. Units: **miles + USD**.

## Architecture
- **Backend** `/app/backend/server.py` (FastAPI + Motor/MongoDB). Custom string ids, all reads exclude `_id`. Platform-agnostic, capture-agnostic scoring engine `compute_verdict()`.
- **Frontend** Expo Router. Providers: SafeArea + Keyboard + Auth + App(data). Tabs: Home / Zones / Insights / Settings (NativeTabs on iOS 26+, classic Tabs otherwise). Modals: verdict, scan, enter, zone-edit, goal; screen: live-capture.
- **Design** dark automotive/trading dashboard (`/app/design_guidelines.json`): Barlow Condensed (display) + DM Sans (body) via expo-font; Amber brand; semantic verdict colors reserved for verdicts/zones.
- **Capture abstraction** `src/capture/OfferCaptureProvider.ts` — `startCapture/stopCapture/onOfferDetected/captureStatus/simulate`. Noop provider by default (Expo Go/web); native module registers via `registerCaptureProvider`. Scoring never depends on capture method.

## Integrations
- GPT-5.6 Luna vision → `POST /api/offers/scan` (base64 image → structured offer JSON). Test rules: `/app/image_testing.md`.
- Emergent Google Auth → `POST /api/auth/session`, `GET /api/auth/me`, `POST /api/auth/logout`. EMERGENT_LLM_KEY in backend `.env`.

## Implemented (2026-09-01)
- ✅ Verdict engine: gross & effective $/mile, gross & net $/hr, fuel/vehicle expense, net profit, profit/effective-mile, score 0–100, verdict (≥80/≥60), WHY reasons (positive/neutral/negative). Learning system blends restaurant wait history by confidence.
- ✅ Offer input: AI screenshot scan (editable review), quick manual entry (large steppers), Live Capture screen (honest, provider-driven) with working demo pipeline.
- ✅ Home dashboard: shift status, START/END shift with live timer, today net/$hr/$mile/deliveries, goal progress + pace ETA, scan/enter/auto-detect entries, best-move card.
- ✅ Shift mode: start/end (idempotent active), live + historical metrics, today summary.
- ✅ Zones + map: hot/neutral/dead zones w/ GPS radius (react-native-maps native + web fallback), CRUD, best zone / repositioning.
- ✅ Insights: offers, shifts, restaurant intelligence, time intelligence (by day/hour, best/worst hour) with bar charts.
- ✅ Settings: thresholds, fuel/MPG/vehicle cost/max deadhead, daily goal, AGGRESSIVE/BALANCED/SELECTIVE presets, Google account + sign out.
- ✅ Daily goal: editable from Settings AND dynamically from Home goal card (steppers + quick picks), `GET/PUT /api/goal`.
- ✅ Onboarding/login screen; rich demo data seeded per user + a fixed demo account for testing.
- ✅ Safety: advisory-only copy throughout; never taps/accepts/declines in delivery apps.

## Testing
- Backend: 32/32 pytest passed (`/app/backend/tests/test_gigverdict.py`). Frontend flows verified (login, dashboard, enter→verdict, auto-detect demo→verdict, goal editor, insights, settings, zones). Report: `/app/test_reports/iteration_1.json`.

## Known platform constraints
- **Auto-Detect / live offer reading** requires a NATIVE BUILD (not Expo Go / web):
  - Android: native **Accessibility Service** reading the Uber Driver offer overlay (user must enable it).
  - iOS: Apple forbids reading other apps' screens → use a **Share Extension** (screenshot → Share → score).
  The scoring engine is already wired to accept live offers; only the native capture module remains.

## Backlog / Next
- P0: Android Accessibility Service native module + Expo config plugin (build-only).
- P1: iOS Share Extension for one-tap screenshot scoring.
- P1: End-of-shift recap; goal streaks/celebration.
- P2: DoorDash/Grubhub-specific scan prompt tuning; export earnings CSV; per-zone historical hourly ranking using real deliveries.
