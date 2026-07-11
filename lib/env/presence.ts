/**
 * Safe env presence checks — never return secret values.
 */

export function isEnvPresent(...keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export function areEnvGroupsPresent(groups: string[][]): boolean {
  return groups.every((group) => isEnvPresent(...group));
}
