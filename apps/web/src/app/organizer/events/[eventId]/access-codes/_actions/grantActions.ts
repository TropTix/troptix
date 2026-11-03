'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { isFlagEnabled } from '@/server/lib/featureFlags';
import { sendGuestInvitations } from '@/server/lib/email';
import { FeatureFlag } from '@troptix/api';
import type {
  CreateGrantInput,
  InviteGuestsInput,
  InviteGuestsResult,
  UpdateGrantInput,
} from '@troptix/api';
import {
  createGrant as createGrantService,
  updateGrant as updateGrantService,
  revokeGrant as revokeGrantService,
  inviteGuests as inviteGuestsService,
  resendInvitation as resendInvitationService,
  releaseInvitationSend,
  ConflictError,
  InvitationLimitError,
  InvitationsNotAllowedError,
  NotFoundError,
  UnauthorizedError,
} from '@troptix/api/server';

type Failure = { success: false; error: string };
type ActionResult<T = object> = ({ success: true } & T) | Failure;

async function guestAccessActor() {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }
  if (
    !(await isFlagEnabled(FeatureFlag.GUEST_ACCESS, {
      id: user.uid,
      email: user.email,
    }))
  ) {
    return null;
  }
  return userToActor(user);
}

function failure(error: unknown, fallback: string): Failure {
  if (error instanceof ConflictError) {
    return { success: false, error: error.message };
  }
  if (error instanceof InvitationLimitError) {
    return { success: false, error: `${error.message}.` };
  }
  if (error instanceof InvitationsNotAllowedError) {
    return {
      success: false,
      error:
        'Sending invitations needs a verified organization or approval for paid tickets. You can still create the codes without sending.',
    };
  }
  if (error instanceof NotFoundError) {
    return { success: false, error: 'Access code or event not found.' };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: 'Authentication required.' };
  }
  if (error instanceof ZodError) {
    return {
      success: false,
      error: error.errors[0]?.message || 'Check the form and try again.',
    };
  }
  console.error('Access code write failed:', error);
  return { success: false, error: fallback };
}

const UNAVAILABLE: Failure = {
  success: false,
  error: 'Access codes are not available yet.',
};

export async function createGrant(
  eventId: string,
  input: CreateGrantInput
): Promise<ActionResult<{ code: string }>> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    const { code } = await createGrantService(prisma, actor, eventId, input);
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true, code };
  } catch (error) {
    return failure(error, "Couldn't create the code. Please try again.");
  }
}

export async function updateGrant(
  eventId: string,
  grantId: string,
  input: UpdateGrantInput
): Promise<ActionResult> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    await updateGrantService(prisma, actor, eventId, grantId, input);
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true };
  } catch (error) {
    return failure(error, "Couldn't save the code. Please try again.");
  }
}

export async function revokeGrant(
  eventId: string,
  grantId: string
): Promise<ActionResult> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    await revokeGrantService(prisma, actor, eventId, grantId);
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true };
  } catch (error) {
    return failure(error, "Couldn't revoke the code. Please try again.");
  }
}

export async function inviteGuests(
  eventId: string,
  input: InviteGuestsInput
): Promise<ActionResult<InviteGuestsResult & { failed: string[] }>> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    const { toSend, ...result } = await inviteGuestsService(
      prisma,
      actor,
      eventId,
      input
    );
    const failed = await sendGuestInvitations(toSend);
    await Promise.all(failed.map((f) => releaseInvitationSend(prisma, f)));
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true, ...result, failed: failed.map((f) => f.to) };
  } catch (error) {
    return failure(error, "Couldn't create the invitations. Please try again.");
  }
}

export async function resendInvitation(
  eventId: string,
  grantId: string
): Promise<ActionResult> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    const invitation = await resendInvitationService(
      prisma,
      actor,
      eventId,
      grantId
    );
    const [failed] = await sendGuestInvitations([invitation]);
    if (failed) {
      await releaseInvitationSend(prisma, failed);
      return {
        success: false,
        error: "The email didn't go out. Try again in a moment.",
      };
    }
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    return { success: true };
  } catch (error) {
    return failure(error, "Couldn't resend the invitation. Please try again.");
  }
}
