"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Textarea } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

type BusinessProfile = {
  id: string;
  displayName: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  bankName: string | null;
  bankBranchName: string | null;
  bankAccountNumberMasked: string | null;
  bankAccountHolder: string | null;
  notes: string | null;
  isDefault: boolean;
};

type BusinessProfileField = {
  id: string;
  key: string;
  label: string;
  value: string | null;
  valueType: string;
};

type ProfileForm = {
  companyName: string;
  displayName: string;
  email: string;
  phone: string;
  addressLine1: string;
  bankName: string;
  bankBranchName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  notes: string;
};

type FieldForm = {
  key: string;
  label: string;
  value: string;
};

const EMPTY_PROFILE_FORM: ProfileForm = {
  companyName: "",
  displayName: "",
  email: "",
  phone: "",
  addressLine1: "",
  bankName: "",
  bankBranchName: "",
  bankAccountNumber: "",
  bankAccountHolder: "",
  notes: "",
};

const EMPTY_FIELD_FORM: FieldForm = {
  key: "",
  label: "",
  value: "",
};

function profileToForm(profile: BusinessProfile): ProfileForm {
  return {
    companyName: profile.companyName,
    displayName: profile.displayName,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    addressLine1: profile.addressLine1 ?? "",
    bankName: profile.bankName ?? "",
    bankBranchName: profile.bankBranchName ?? "",
    bankAccountNumber: "",
    bankAccountHolder: profile.bankAccountHolder ?? "",
    notes: profile.notes ?? "",
  };
}

function cleanProfilePayload(form: ProfileForm) {
  return {
    companyName: form.companyName,
    displayName: form.displayName || form.companyName,
    email: form.email || null,
    phone: form.phone || null,
    addressLine1: form.addressLine1 || null,
    bankName: form.bankName || null,
    bankBranchName: form.bankBranchName || null,
    ...(form.bankAccountNumber.trim()
      ? { bankAccountNumber: form.bankAccountNumber.trim() }
      : {}),
    bankAccountHolder: form.bankAccountHolder || null,
    notes: form.notes || null,
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "保存に失敗しました";
  } catch {
    return "保存に失敗しました";
  }
}

export function BusinessProfileSettings() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [fields, setFields] = useState<BusinessProfileField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM);
  const [fieldForm, setFieldForm] = useState<FieldForm>(EMPTY_FIELD_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessProfile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const loadProfiles = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/business-profiles", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { profiles: BusinessProfile[] };
    setProfiles(body.profiles);
    setSelectedId((current) => current ?? body.profiles[0]?.id ?? null);
  }, []);

  const loadFields = useCallback(async (profileId: string | null) => {
    if (!profileId) {
      setFields([]);
      return;
    }
    const response = await fetch(`/api/business-profiles/${profileId}/fields`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { fields: BusinessProfileField[] };
    setFields(body.fields);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadProfiles()
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadProfiles]);

  useEffect(() => {
    let active = true;
    loadFields(selectedId)
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [loadFields, selectedId]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_PROFILE_FORM);
  }

  function startEdit(profile: BusinessProfile) {
    setEditingId(profile.id);
    setSelectedId(profile.id);
    setForm(profileToForm(profile));
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        editingId ? `/api/business-profiles/${editingId}` : "/api/business-profiles",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanProfilePayload(form)),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { profile: BusinessProfile };
      await loadProfiles();
      setSelectedId(body.profile.id);
      setEditingId(body.profile.id);
      setForm(profileToForm(body.profile));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(profileId: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/business-profiles/${profileId}/default`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile() {
    if (!deleteTarget || deleteConfirm !== "DELETE") return;
    setSaving(true);
    setError(null);
    try {
      const switchToProfileId =
        profiles.find((profile) => profile.id !== deleteTarget.id)?.id ?? null;
      const response = await fetch(`/api/business-profiles/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ switchToProfileId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setDeleteTarget(null);
      setDeleteConfirm("");
      setEditingId(null);
      setForm(EMPTY_PROFILE_FORM);
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/business-profiles/${selectedId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fieldForm,
          valueType: "text",
          sensitivity: "internal",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setFieldForm(EMPTY_FIELD_FORM);
      await loadFields(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomField(field: BusinessProfileField) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/business-profiles/${selectedId}/fields/${field.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await readError(response));
      await loadFields(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function exportJson() {
    const response = await fetch("/api/business-profiles/export", {
      cache: "no-store",
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "business-profiles.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingState message={ui.businessProfile.loading} />;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-fade-up">
      <header className="space-y-3">
        <p className="text-caption">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.businessProfile.title}</h1>
        <p className="max-w-2xl text-body">{ui.businessProfile.subtitle}</p>
        <ul className="grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
          {ui.businessProfile.trustItems.map((item) => (
            <li
              key={item}
              className="rounded-full bg-[var(--surface-muted)] px-4 py-3"
            >
              {item}
            </li>
          ))}
        </ul>
      </header>

      {error && <ErrorState title="エラー" message={error} />}

      <Card padding="md" className="space-y-2 border border-[var(--border-subtle)]">
        <h2 className="text-title text-foreground">{ui.businessProfile.usageTitle}</h2>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.businessProfile.usageHint}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-title text-foreground">
              {ui.businessProfile.title}
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={exportJson}>
                {ui.businessProfile.exportJson}
              </Button>
              <Button size="sm" onClick={startCreate}>
                {ui.businessProfile.create}
              </Button>
            </div>
          </div>

          {profiles.length === 0 ? (
            <Card padding="sm" className="border border-dashed border-[var(--border)]">
              <p className="text-sm text-[var(--text-secondary)]">
                {ui.businessProfile.empty}
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <Card
                    padding="sm"
                    className="space-y-4 border border-[var(--border-subtle)]"
                  >
                    <button
                      type="button"
                      className="min-h-[44px] w-full text-left focus-ring"
                      onClick={() => {
                        setSelectedId(profile.id);
                        startEdit(profile);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {profile.displayName || profile.companyName}
                          </h3>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {profile.companyName}
                          </p>
                        </div>
                        {profile.isDefault && (
                          <span className="rounded-full bg-[var(--accent-muted)] px-3 py-1 text-xs text-accent">
                            {ui.businessProfile.defaultBadge}
                          </span>
                        )}
                      </div>
                      <dl className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                        {profile.email && <div>{profile.email}</div>}
                        {profile.phone && <div>{profile.phone}</div>}
                        {profile.bankAccountNumberMasked && (
                          <div>口座: {profile.bankAccountNumberMasked}</div>
                        )}
                      </dl>
                    </button>

                    <div className="flex flex-wrap gap-2">
                      {!profile.isDefault && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDefault(profile.id)}
                          disabled={saving}
                        >
                          {ui.businessProfile.setDefault}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startEdit(profile)}
                      >
                        {ui.businessProfile.edit}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteTarget(profile)}
                      >
                        {ui.businessProfile.delete}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <Card padding="md" className="border border-[var(--border-subtle)]">
            <form className="space-y-4" onSubmit={submitProfile}>
              <h2 className="text-title text-foreground">
                {editingId
                  ? ui.businessProfile.editTitle
                  : ui.businessProfile.createTitle}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  required
                  label={ui.businessProfile.companyName}
                  value={form.companyName}
                  onChange={(event) =>
                    setForm({ ...form, companyName: event.target.value })
                  }
                />
                <Input
                  label={ui.businessProfile.displayName}
                  value={form.displayName}
                  onChange={(event) =>
                    setForm({ ...form, displayName: event.target.value })
                  }
                />
                <Input
                  type="email"
                  label={ui.businessProfile.email}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
                <Input
                  label={ui.businessProfile.phone}
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
                <Input
                  label={ui.businessProfile.bankName}
                  value={form.bankName}
                  onChange={(event) =>
                    setForm({ ...form, bankName: event.target.value })
                  }
                />
                <Input
                  label={ui.businessProfile.bankBranchName}
                  value={form.bankBranchName}
                  onChange={(event) =>
                    setForm({ ...form, bankBranchName: event.target.value })
                  }
                />
                <Input
                  inputMode="numeric"
                  label={ui.businessProfile.bankAccountNumber}
                  placeholder={selectedProfile?.bankAccountNumberMasked ?? ""}
                  value={form.bankAccountNumber}
                  onChange={(event) =>
                    setForm({ ...form, bankAccountNumber: event.target.value })
                  }
                />
                <Input
                  label={ui.businessProfile.bankAccountHolder}
                  value={form.bankAccountHolder}
                  onChange={(event) =>
                    setForm({ ...form, bankAccountHolder: event.target.value })
                  }
                />
              </div>
              <Textarea
                label={ui.businessProfile.addressLine1}
                value={form.addressLine1}
                onChange={(event) =>
                  setForm({ ...form, addressLine1: event.target.value })
                }
              />
              <Textarea
                label={ui.businessProfile.notes}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" isLoading={saving}>
                  {editingId ? ui.businessProfile.save : ui.businessProfile.create}
                </Button>
                <Button type="button" variant="secondary" onClick={startCreate}>
                  {ui.businessProfile.cancel}
                </Button>
              </div>
            </form>
          </Card>

          <Card padding="md" className="space-y-4 border border-[var(--border-subtle)]">
            <div>
              <h2 className="text-title text-foreground">
                {ui.businessProfile.fieldsTitle}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {ui.businessProfile.fieldsHint}
              </p>
            </div>
            <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={submitField}>
              <Input
                required
                label={ui.businessProfile.customKey}
                value={fieldForm.key}
                onChange={(event) =>
                  setFieldForm({ ...fieldForm, key: event.target.value })
                }
              />
              <Input
                required
                label={ui.businessProfile.customLabel}
                value={fieldForm.label}
                onChange={(event) =>
                  setFieldForm({ ...fieldForm, label: event.target.value })
                }
              />
              <Input
                label={ui.businessProfile.customValue}
                value={fieldForm.value}
                onChange={(event) =>
                  setFieldForm({ ...fieldForm, value: event.target.value })
                }
              />
              <div className="flex items-end">
                <Button type="submit" size="sm" disabled={!selectedId || saving}>
                  {ui.businessProfile.addField}
                </Button>
              </div>
            </form>

            <ul className="space-y-2">
              {fields.map((field) => (
                <li
                  key={field.id}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{field.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {field.key}: {field.value ?? "未入力"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteCustomField(field)}
                    disabled={saving}
                  >
                    {ui.businessProfile.delete}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <Card
            padding="md"
            className="w-full max-w-md space-y-4 border border-[var(--border-subtle)]"
            role="dialog"
            aria-modal="true"
          >
            <div>
              <h2 className="text-title text-foreground">
                {ui.businessProfile.deleteTitle}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {ui.businessProfile.deleteHint}
              </p>
            </div>
            <Input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="DELETE"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={deleteConfirm !== "DELETE" || saving}
                onClick={deleteProfile}
              >
                {ui.businessProfile.delete}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
              >
                {ui.businessProfile.cancel}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
