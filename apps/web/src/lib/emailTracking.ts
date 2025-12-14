import posthog from 'posthog-js';

export interface EmailCampaignSource {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  event_id: string;
}

export const EMAIL_TRACKING_KEY = 'email_campaign_source';

export function getEmailCampaignSource(): EmailCampaignSource | null {
  if (typeof window === 'undefined') return null;

  const stored = sessionStorage.getItem(EMAIL_TRACKING_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function setEmailCampaignSource(source: EmailCampaignSource): void {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(EMAIL_TRACKING_KEY, JSON.stringify(source));
}

export function trackEmailEventPageView(
  eventData: {
    event_id: string;
    event_name: string;
    organizer: string;
  },
  utmParams: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
  }
): void {
  posthog?.capture('email_event_page_view', {
    ...eventData,
    ...utmParams,
  });

  setEmailCampaignSource({
    ...utmParams,
    event_id: eventData.event_id,
  });
}

export function trackEmailTicketPurchaseStart(eventData: {
  event_id: string;
  event_name: string;
  organizer: string;
}): void {
  const emailSource = getEmailCampaignSource();
  if (emailSource) {
    posthog?.capture('email_ticket_purchase_start', {
      ...eventData,
      ...emailSource,
    });
  }
}

export function trackEmailTicketPurchaseComplete(purchaseData: {
  event_id: string;
  order_id: string | null;
  total_amount: number;
  subtotal: number;
  fees: number;
  total_tickets: number;
  user_email: string;
  is_free: boolean;
  promotion_applied: string | null;
}): void {
  const emailSource = getEmailCampaignSource();
  if (emailSource) {
    posthog?.capture('email_ticket_purchase_complete', {
      ...purchaseData,
      ...emailSource,
    });
  }
}
