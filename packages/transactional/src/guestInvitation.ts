import { createElement } from 'react';
import { render } from 'react-email';
import GuestInvitationTemplate, {
  invitationLink,
  type GuestInvitation,
} from '../emails/GuestInvitation';

export interface GuestInvitationEmail {
  subject: string;
  html: string;
  text: string;
  link: string;
}

export async function buildGuestInvitation(
  invite: GuestInvitation,
  { baseUrl }: { baseUrl: string }
): Promise<GuestInvitationEmail> {
  const element = createElement(GuestInvitationTemplate, { invite, baseUrl });
  return {
    subject: `You're invited to ${invite.eventName} by ${invite.organizationName}`,
    html: await render(element),
    text: await render(element, { plainText: true }),
    link: invitationLink(invite, baseUrl),
  };
}
