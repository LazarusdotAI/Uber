// App data context — shared settings, dashboard/shift state, and the
// verdict hand-off between offer input screens and the Verdict screen.
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { api } from "@/src/api/client";

export type OfferResult = {
  score: number;
  verdict: string;
  gross_per_mile: number;
  effective_per_mile: number;
  gross_hourly: number;
  fuel_expense: number;
  vehicle_expense: number;
  total_expense: number;
  net_profit: number;
  net_hourly: number;
  profit_per_effective_mile: number;
  effective_miles: number;
  wait_used: number;
  reasons: { text: string; sentiment: string }[];
  restaurant_intel?: any;
};

export type ScoredOffer = {
  offer: any;
  result: OfferResult;
  savedId?: string | null;
};

type AppState = {
  settings: any | null;
  dashboard: any | null;
  loadingDash: boolean;
  lastScored: ScoredOffer | null;
  setLastScored: (s: ScoredOffer | null) => void;
  refreshDashboard: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  startShift: () => Promise<void>;
  endShift: () => Promise<void>;
};

const AppContext = createContext<AppState>({} as AppState);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<any | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const lastRef = useRef<ScoredOffer | null>(null);
  const [, force] = useState(0);

  const setLastScored = useCallback((s: ScoredOffer | null) => {
    lastRef.current = s;
    force((n) => n + 1);
  }, []);

  const refreshDashboard = useCallback(async () => {
    setLoadingDash(true);
    try {
      const d = await api.get("/dashboard");
      setDashboard(d);
    } catch {
      /* keep prior */
    } finally {
      setLoadingDash(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.get("/settings");
      setSettings(s);
    } catch {}
  }, []);

  const startShift = useCallback(async () => {
    await api.post("/shifts/start");
    await refreshDashboard();
  }, [refreshDashboard]);

  const endShift = useCallback(async () => {
    const active = dashboard?.active_shift;
    if (active?.id) {
      await api.post("/shifts/end", { shift_id: active.id });
      await refreshDashboard();
    }
  }, [dashboard, refreshDashboard]);

  return (
    <AppContext.Provider
      value={{
        settings,
        dashboard,
        loadingDash,
        lastScored: lastRef.current,
        setLastScored,
        refreshDashboard,
        refreshSettings,
        startShift,
        endShift,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
