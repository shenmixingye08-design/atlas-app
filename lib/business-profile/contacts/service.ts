import "server-only";

import { businessProfileRepository } from "../repository";
import type {
  BusinessContact,
  CreateBusinessContactInput,
  UpdateBusinessContactInput,
} from "../types";

export async function listContacts(
  ownerUserId: string,
  filter?: { profileId?: string | null },
): Promise<BusinessContact[]> {
  return businessProfileRepository.listContacts(ownerUserId, filter);
}

export async function getContactForUser(
  ownerUserId: string,
  contactId: string,
): Promise<BusinessContact | null> {
  return businessProfileRepository.getContactForUser(ownerUserId, contactId);
}

export async function createContact(
  ownerUserId: string,
  input: CreateBusinessContactInput,
): Promise<BusinessContact | null> {
  return businessProfileRepository.createContact(ownerUserId, input);
}

export async function updateContact(
  ownerUserId: string,
  contactId: string,
  patch: UpdateBusinessContactInput,
): Promise<BusinessContact | null> {
  return businessProfileRepository.updateContact(ownerUserId, contactId, patch);
}

export async function softDeleteContact(
  ownerUserId: string,
  contactId: string,
): Promise<boolean> {
  return businessProfileRepository.softDeleteContact(ownerUserId, contactId);
}
