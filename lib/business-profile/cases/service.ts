import "server-only";

import { businessProfileRepository } from "../repository";
import type {
  BusinessCase,
  BusinessCaseContact,
  CreateBusinessCaseInput,
  UpdateBusinessCaseInput,
} from "../types";

export async function listCases(
  ownerUserId: string,
  filter?: { profileId?: string | null },
): Promise<BusinessCase[]> {
  return businessProfileRepository.listCases(ownerUserId, filter);
}

export async function getCaseForUser(
  ownerUserId: string,
  caseId: string,
): Promise<BusinessCase | null> {
  return businessProfileRepository.getCaseForUser(ownerUserId, caseId);
}

export async function createCase(
  ownerUserId: string,
  input: CreateBusinessCaseInput,
): Promise<BusinessCase | null> {
  return businessProfileRepository.createCase(ownerUserId, input);
}

export async function updateCase(
  ownerUserId: string,
  caseId: string,
  patch: UpdateBusinessCaseInput,
): Promise<BusinessCase | null> {
  return businessProfileRepository.updateCase(ownerUserId, caseId, patch);
}

export async function softDeleteCase(
  ownerUserId: string,
  caseId: string,
): Promise<boolean> {
  return businessProfileRepository.softDeleteCase(ownerUserId, caseId);
}

export async function linkCaseContact(input: {
  ownerUserId: string;
  caseId: string;
  contactId: string;
  role?: string | null;
}): Promise<BusinessCaseContact | null> {
  return businessProfileRepository.linkCaseContact(input);
}
