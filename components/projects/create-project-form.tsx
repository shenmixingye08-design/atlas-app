"use client";

import { useState } from "react";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type CreateProjectFormProps = {
  onSubmit: (title: string, workRequest: string) => void;
  onCancel: () => void;
};

export function CreateProjectForm({
  onSubmit,
  onCancel,
}: CreateProjectFormProps) {
  const [title, setTitle] = useState("");
  const [workRequest, setWorkRequest] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !workRequest.trim()) return;
    onSubmit(title, workRequest);
    setTitle("");
    setWorkRequest("");
  };

  return (
    <Card padding="lg" className="animate-fade-up">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={ui.project.name}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Q2 マーケティング計画"
          required
        />
        <Textarea
          label={ui.project.workRequest}
          value={workRequest}
          onChange={(e) => setWorkRequest(e.target.value)}
          placeholder={ui.work.placeholder}
          rows={3}
          required
        />
        <div className="flex gap-3">
          <Button type="submit" variant="primary">
            {ui.actions.create}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {ui.actions.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
