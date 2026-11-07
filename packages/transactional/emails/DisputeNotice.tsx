import * as React from 'react';
import { Html, Head, Body, Container, Text, Link } from 'react-email';

export interface DisputeNotice {
  id: string;
  amount: string;
  reason: string;
  charge: string;
}

export default function DisputeNoticeTemplate({
  dispute,
}: {
  dispute: DisputeNotice;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container>
          <Text>
            A buyer disputed a charge: <strong>{dispute.amount}</strong>, reason{' '}
            <code>{dispute.reason}</code>.
          </Text>
          <Text>
            Dispute{' '}
            <Link
              href={`https://dashboard.stripe.com/payments/${encodeURIComponent(dispute.charge)}`}
            >
              {dispute.id}
            </Link>{' '}
            on charge <code>{dispute.charge}</code>.
          </Text>
          <Text>
            If the organizer has already been paid for this event, reverse that
            transfer today. Steps are in docs/runbooks/stripe-connect.md.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
