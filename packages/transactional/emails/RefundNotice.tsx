import * as React from 'react';
import { Html, Head, Body, Container, Text } from 'react-email';

export interface RefundNotice {
  firstName: string | null;
  eventName: string;
  amount: string;
}

export default function RefundNoticeTemplate({
  notice,
}: {
  notice: RefundNotice;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container>
          <Text>Hi {notice.firstName ?? 'there'},</Text>
          <Text>
            Unfortunately, tickets to <strong>{notice.eventName}</strong> sold
            out while your payment was processing, so we&rsquo;ve refunded your{' '}
            {notice.amount} in full.
          </Text>
          <Text>
            The refund may take a few days to appear on your statement. You were
            not charged for any tickets.
          </Text>
          <Text>— TropTix</Text>
        </Container>
      </Body>
    </Html>
  );
}
