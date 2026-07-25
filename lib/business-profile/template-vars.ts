import type { ArtifactContext } from "./types";

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*(profile|contact|project)\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function extractTemplateVariables(template: string | null | undefined): string[] {
  if (!template) return [];
  const variables = new Set<string>();
  for (const match of template.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    variables.add(`${match[1]}.${match[2]}`);
  }
  return [...variables];
}

export function missingVariableMarker(variable: string): string {
  return `[[MISSING:${variable}]]`;
}

export function resolveTemplateVariable(
  context: ArtifactContext,
  variable: string,
): string | null {
  return context.variables[variable] ?? null;
}

export function applyTemplateVariables(
  template: string,
  context: ArtifactContext,
  options?: { requiredVariables?: string[] },
): string {
  const required = new Set(options?.requiredVariables ?? extractTemplateVariables(template));

  return template.replace(
    TEMPLATE_VARIABLE_PATTERN,
    (placeholder: string, scope: string, key: string) => {
      const variable = `${scope}.${key}`;
      const value = resolveTemplateVariable(context, variable);
      if (value) return value;
      return required.has(variable) ? missingVariableMarker(variable) : placeholder;
    },
  );
}
