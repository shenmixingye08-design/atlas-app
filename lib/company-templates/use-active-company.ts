"use client";

import { useCallback, useEffect, useState } from "react";

import type { ActiveCompanyConfig } from "@/lib/company-templates/types";
import {
  applyCompanyTemplateClient,
  fetchActiveCompany,
} from "@/lib/company-templates/client";

export function useActiveCompany() {
  const [config, setConfig] = useState<ActiveCompanyConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const active = await fetchActiveCompany();
      applyCompanyTemplateClient(active.state.templateId);
      setConfig(active.config);
    } catch {
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, isLoading, refresh };
}
