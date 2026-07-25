import {
  listFields,
  listProfiles,
} from "@/lib/business-profile";
import { listCases } from "@/lib/business-profile/cases/service";
import { listContacts } from "@/lib/business-profile/contacts/service";
import { extractLast4, maskLast4 } from "@/lib/business-profile/crypto";
import type { BusinessProfileField } from "@/lib/business-profile/types";

import {
  requireUserId,
  unknownErrorResponse,
} from "../../business-profile-utils";

function safeField(field: BusinessProfileField): BusinessProfileField {
  if (
    field.value &&
    (field.valueType === "bank_account" ||
      /(?:bankAccountNumber|account_number|accountNumber)/.test(field.key))
  ) {
    return {
      ...field,
      value: maskLast4(extractLast4(field.value)),
    };
  }
  return field;
}

export async function GET(): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  try {
    const [profiles, contacts, cases] = await Promise.all([
      listProfiles(auth.userId),
      listContacts(auth.userId),
      listCases(auth.userId),
    ]);
    const fieldsByProfile = Object.fromEntries(
      await Promise.all(
        profiles.map(async (profile) => [
          profile.id,
          (await listFields(auth.userId, profile.id)).map(safeField),
        ]),
      ),
    );

    return Response.json({
      exportedAt: new Date().toISOString(),
      profiles,
      fieldsByProfile,
      contacts,
      cases,
    });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/export");
  }
}
