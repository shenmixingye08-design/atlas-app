"use client";

import { useCallback, useEffect, useState } from "react";

import { loadUserWorkProfile, resetUserWorkProfile } from "./store";
import type { UserWorkProfile } from "./types";

export function useWorkProfile() {
  const [profile, setProfile] = useState<UserWorkProfile>(() =>
    loadUserWorkProfile(),
  );

  const refresh = useCallback(() => {
    setProfile(loadUserWorkProfile());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reset = useCallback(() => {
    setProfile(resetUserWorkProfile());
  }, []);

  return { profile, refresh, reset };
}
