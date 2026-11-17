import { createElement } from 'react';
import { render } from 'react-email';
import RefundNoticeTemplate, {
  type RefundNotice,
} from '../emails/RefundNotice';
import DisputeNoticeTemplate, {
  type DisputeNotice,
} from '../emails/DisputeNotice';
import type { EmailContent } from './orderConfirmation';

export async function buildRefundNotice(
  notice: RefundNotice
): Promise<EmailContent> {
  return {
    subject: `Your ${notice.eventName} payment was refunded`,
    html: await render(createElement(RefundNoticeTemplate, { notice })),
    attachments: [],
  };
}

export async function buildDisputeNotice(
  dispute: DisputeNotice
): Promise<EmailContent> {
  return {
    subject: `Chargeback opened: ${dispute.amount} (${dispute.id})`,
    html: await render(createElement(DisputeNoticeTemplate, { dispute })),
    attachments: [],
  };
}
