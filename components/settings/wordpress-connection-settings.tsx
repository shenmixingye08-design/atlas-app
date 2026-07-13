"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Textarea } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { SuccessState } from "@/components/ui/success-state";
import {
  disconnectExternalService,
  fetchExternalServiceCatalog,
  formatExternalServiceTimestamp,
} from "@/lib/integrations/external-services";
import type { ExternalServiceView } from "@/lib/integrations/external-services";
import {
  connectWordPressClient,
  createWordPressPostClient,
  fetchWordPressCategoriesClient,
  fetchWordPressTagsClient,
  updateWordPressPostClient,
  verifyWordPressConnectionClient,
} from "@/lib/integrations/wordpress/client";
import type {
  WordPressCategory,
  WordPressTag,
} from "@/lib/integrations/wordpress/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

function statusLabel(service: ExternalServiceView): string {
  const { connection } = service;
  if (connection.status === "connected") {
    return ui.wordpressSettings.statusConnected;
  }
  if (connection.status === "error") {
    const isAuth = connection.errorMessage?.includes("認証");
    return isAuth
      ? ui.wordpressSettings.statusAuthFailure
      : ui.wordpressSettings.statusError;
  }
  return ui.externalServices.status[connection.status];
}

function statusClass(service: ExternalServiceView): string {
  const { connection } = service;
  if (connection.status === "connected") {
    return "bg-[var(--status-success-bg)] text-[var(--status-success)] ring-[var(--status-success)]/30";
  }
  if (connection.status === "error") {
    return "bg-[var(--status-error-bg)] text-[var(--status-error)] ring-[var(--status-error)]/30";
  }
  if (connection.status === "pending") {
    return "bg-[var(--status-warning-bg)] text-[var(--status-warning)] ring-[var(--status-warning)]/30";
  }
  return "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] ring-[var(--status-neutral)]/25";
}

export function WordPressConnectionSettings() {
  const [service, setService] = useState<ExternalServiceView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [applicationPassword, setApplicationPassword] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [featuredImageUrl, setFeaturedImageUrl] = useState("");
  const [updatePostId, setUpdatePostId] = useState("");
  const [categories, setCategories] = useState<WordPressCategory[]>([]);
  const [tags, setTags] = useState<WordPressTag[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [taxonomiesLoading, setTaxonomiesLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchExternalServiceCatalog();
      const wp = catalog.services.find((item) => item.serviceId === "wordpress");
      setService(wp ?? null);
      if (wp?.connection.account?.email) {
        setSiteUrl(wp.connection.account.email);
      }
      if (wp?.connection.account?.username) {
        setUsername(wp.connection.account.username);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTaxonomies = useCallback(async () => {
    setTaxonomiesLoading(true);
    try {
      const [cats, tagResult] = await Promise.all([
        fetchWordPressCategoriesClient(),
        fetchWordPressTagsClient(),
      ]);
      if (cats.status === "ok") setCategories(cats.categories);
      if (tagResult.status === "ok") setTags(tagResult.tags);
    } catch {
      // Non-fatal on settings page.
    } finally {
      setTaxonomiesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (service?.connection.status === "connected") {
      void loadTaxonomies();
    }
  }, [service?.connection.status, loadTaxonomies]);

  const handleConnect = async (isReconnect = false) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await connectWordPressClient({
        siteUrl,
        username,
        applicationPassword,
      });
      setApplicationPassword("");
      await load();
      setSuccess(
        isReconnect
          ? ui.wordpressSettings.reconnectSuccess
          : result.message || ui.wordpressSettings.connectSuccess,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.wordpressSettings.connectError,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await disconnectExternalService("wordpress");
      setCategories([]);
      setTags([]);
      setSelectedCategoryIds([]);
      setSelectedTagIds([]);
      await load();
      setSuccess(ui.wordpressSettings.disconnectSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.disconnectFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setChecking(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await verifyWordPressConnectionClient();
      if (result.status === "ready") {
        setSuccess(ui.wordpressSettings.checkSuccess);
        await load();
      } else {
        setError(result.message || ui.wordpressSettings.checkFailed);
        await load();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.wordpressSettings.checkFailed,
      );
    } finally {
      setChecking(false);
    }
  };

  const buildPayload = (status: "draft" | "publish") => ({
    title,
    content,
    status,
    categories: selectedCategoryIds,
    tags: selectedTagIds,
    featuredImageUrl: featuredImageUrl.trim() || undefined,
  });

  const handlePost = async (status: "draft" | "publish") => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createWordPressPostClient(buildPayload(status));
      if (result.status === "posted" || result.status === "draft_saved") {
        setSuccess(
          result.link
            ? `${result.message}（${result.link}）`
            : result.message,
        );
        if (result.postId) setUpdatePostId(String(result.postId));
      } else {
        setError(result.message || ui.wordpressSettings.postFailed);
        if (result.status === "auth_failure" || result.status === "wp_not_connected") {
          await load();
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.wordpressSettings.postFailed,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    const postId = Number(updatePostId);
    if (!Number.isFinite(postId) || postId <= 0) {
      setError(ui.wordpressSettings.invalidPostId);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateWordPressPostClient(
        postId,
        buildPayload("draft"),
      );
      if (result.status === "updated") {
        setSuccess(
          result.link
            ? `${result.message}（${result.link}）`
            : result.message,
        );
      } else {
        setError(result.message || ui.wordpressSettings.updateFailed);
        if (result.status === "auth_failure" || result.status === "wp_not_connected") {
          await load();
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.wordpressSettings.updateFailed,
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleId = (
    id: number,
    selected: number[],
    setSelected: (ids: number[]) => void,
  ) => {
    setSelected(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  };

  if (isLoading) {
    return <LoadingState message={ui.loading} />;
  }

  const isConnected = service?.connection.status === "connected";
  const needsReconnect = service?.connection.status === "error";
  const connectDisabled =
    !service?.featureEnabled ||
    busy ||
    !siteUrl.trim() ||
    !username.trim() ||
    !applicationPassword.trim();

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      {success && <SuccessState message={success} />}

      {!service ? (
        <Card padding="sm">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.wordpressSettings.unavailable}
          </p>
        </Card>
      ) : (
        <>
          <Card padding="md" className="border border-[var(--border-subtle)]">
            <div className="flex flex-col gap-5">
              <div className="flex min-w-0 gap-4">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-3xl ring-1 ring-[var(--border)]"
                  aria-hidden
                >
                  {service.icon}
                </span>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {service.serviceName}
                    </h2>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                        statusClass(service),
                      )}
                    >
                      {statusLabel(service)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {ui.wordpressSettings.subtitle}
                  </p>
                  {(isConnected || needsReconnect) &&
                    service.connection.account && (
                      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
                        <p>
                          <span className="font-medium text-foreground">
                            {ui.wordpressSettings.siteUrlLabel}:
                          </span>{" "}
                          {service.connection.account.email}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">
                            {ui.wordpressSettings.usernameLabel}:
                          </span>{" "}
                          {service.connection.account.username}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">
                            {ui.wordpressSettings.lastConnectedLabel}:
                          </span>{" "}
                          {formatExternalServiceTimestamp(
                            service.connection.connectedAt,
                          )}
                        </p>
                      </div>
                    )}
                  {service.connection.errorMessage && (
                    <p className="text-sm text-[var(--status-error)]">
                      {service.connection.errorMessage}
                    </p>
                  )}
                  {!service.featureEnabled && (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {ui.externalServices.featureDisabledHint}
                    </p>
                  )}
                </div>
              </div>

              {(!isConnected || needsReconnect) && (
                <div className="grid gap-3 sm:grid-cols-1">
                  <Input
                    label={ui.wordpressSettings.siteUrlLabel}
                    hint={ui.wordpressSettings.siteUrlHint}
                    value={siteUrl}
                    onChange={(event) => setSiteUrl(event.target.value)}
                    placeholder="https://example.com"
                    autoComplete="url"
                    inputMode="url"
                  />
                  <Input
                    label={ui.wordpressSettings.usernameLabel}
                    hint={ui.wordpressSettings.usernameHint}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                  />
                  <Input
                    label={ui.wordpressSettings.appPasswordLabel}
                    hint={ui.wordpressSettings.appPasswordHint}
                    type="password"
                    value={applicationPassword}
                    onChange={(event) =>
                      setApplicationPassword(event.target.value)
                    }
                    autoComplete="current-password"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {isConnected ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy || checking}
                      onClick={() => void handleVerify()}
                      className="w-full sm:w-auto"
                    >
                      {checking
                        ? ui.wordpressSettings.checking
                        : ui.wordpressSettings.checkConnection}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleDisconnect()}
                      className="w-full sm:w-auto"
                    >
                      {ui.actions.disconnect}
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={connectDisabled}
                    isLoading={busy}
                    onClick={() => void handleConnect(needsReconnect)}
                    className="w-full sm:w-auto"
                  >
                    {needsReconnect
                      ? ui.wordpressSettings.reconnect
                      : ui.actions.connect}
                  </Button>
                )}
              </div>

              {isConnected && (
                <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4">
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {ui.wordpressSettings.reconnectFormHint}
                  </p>
                  <Input
                    label={ui.wordpressSettings.siteUrlLabel}
                    value={siteUrl}
                    onChange={(event) => setSiteUrl(event.target.value)}
                  />
                  <Input
                    label={ui.wordpressSettings.usernameLabel}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                  <Input
                    label={ui.wordpressSettings.appPasswordLabel}
                    type="password"
                    value={applicationPassword}
                    onChange={(event) =>
                      setApplicationPassword(event.target.value)
                    }
                    hint={ui.wordpressSettings.reconnectPasswordHint}
                  />
                  <Button
                    variant="secondary"
                    disabled={connectDisabled}
                    isLoading={busy}
                    onClick={() => void handleConnect(true)}
                    className="w-full sm:w-auto"
                  >
                    {ui.wordpressSettings.reconnect}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {isConnected && (
            <Card padding="md" className="border border-[var(--border-subtle)]">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {ui.wordpressSettings.postTitle}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                    {ui.wordpressSettings.postHint}
                  </p>
                </div>

                <Input
                  label={ui.wordpressSettings.articleTitleLabel}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <Textarea
                  label={ui.wordpressSettings.articleContentLabel}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={8}
                />
                <Input
                  label={ui.wordpressSettings.featuredImageLabel}
                  hint={ui.wordpressSettings.featuredImageHint}
                  value={featuredImageUrl}
                  onChange={(event) => setFeaturedImageUrl(event.target.value)}
                  placeholder="https://..."
                />
                <Input
                  label={ui.wordpressSettings.updatePostIdLabel}
                  hint={ui.wordpressSettings.updatePostIdHint}
                  value={updatePostId}
                  onChange={(event) => setUpdatePostId(event.target.value)}
                  inputMode="numeric"
                />

                <div className="space-y-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {ui.wordpressSettings.categoriesLabel}
                    {taxonomiesLoading ? `（${ui.loading}）` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categories.length === 0 ? (
                      <p className="text-caption text-[var(--foreground-muted)]">
                        {ui.wordpressSettings.noCategories}
                      </p>
                    ) : (
                      categories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs ring-1 ring-inset",
                            selectedCategoryIds.includes(category.id)
                              ? "bg-[var(--status-success-bg)] text-[var(--status-success)] ring-[var(--status-success)]/30"
                              : "bg-[var(--background-subtle)] text-[var(--foreground-muted)] ring-[var(--border)]",
                          )}
                          onClick={() =>
                            toggleId(
                              category.id,
                              selectedCategoryIds,
                              setSelectedCategoryIds,
                            )
                          }
                        >
                          {category.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {ui.wordpressSettings.tagsLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tags.length === 0 ? (
                      <p className="text-caption text-[var(--foreground-muted)]">
                        {ui.wordpressSettings.noTags}
                      </p>
                    ) : (
                      tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs ring-1 ring-inset",
                            selectedTagIds.includes(tag.id)
                              ? "bg-[var(--status-success-bg)] text-[var(--status-success)] ring-[var(--status-success)]/30"
                              : "bg-[var(--background-subtle)] text-[var(--foreground-muted)] ring-[var(--border)]",
                          )}
                          onClick={() =>
                            toggleId(tag.id, selectedTagIds, setSelectedTagIds)
                          }
                        >
                          {tag.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    variant="secondary"
                    disabled={busy || !title.trim() || !content.trim()}
                    isLoading={busy}
                    onClick={() => void handlePost("draft")}
                    className="w-full sm:w-auto"
                  >
                    {ui.wordpressSettings.saveDraft}
                  </Button>
                  <Button
                    disabled={busy || !title.trim() || !content.trim()}
                    isLoading={busy}
                    onClick={() => void handlePost("publish")}
                    className="w-full sm:w-auto"
                  >
                    {ui.wordpressSettings.publish}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || !title.trim() || !content.trim()}
                    isLoading={busy}
                    onClick={() => void handleUpdate()}
                    className="w-full sm:w-auto"
                  >
                    {ui.wordpressSettings.update}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <p className="text-sm">
            <Link
              href="/settings"
              className="font-medium text-accent hover:underline"
            >
              {ui.wordpressSettings.backToSettings}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
