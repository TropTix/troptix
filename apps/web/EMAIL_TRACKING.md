# Email Campaign Tracking Implementation

This document explains how to set up email links with tracking parameters to measure conversion from email campaigns to ticket purchases.

## Email Link Format

When sending emails to promote events, use the following URL format:

```
https://yoursite.com/events/[eventId]?utm_source=email&utm_medium=email_campaign&utm_campaign=event_promotion&utm_content=event_[eventId]
```

### UTM Parameters

- `utm_source=email` - Identifies the traffic source as email
- `utm_medium=email_campaign` - Specifies this is from an email marketing campaign
- `utm_campaign=event_promotion` - Campaign name (customize as needed)
- `utm_content=event_[eventId]` - Specific content identifier

### Example URLs

```
https://yoursite.com/events/123?utm_source=email&utm_medium=email_campaign&utm_campaign=summer_festival&utm_content=event_123

https://yoursite.com/events/456?utm_source=email&utm_medium=email_campaign&utm_campaign=weekly_newsletter&utm_content=event_456
```

## Tracked Events

The system automatically tracks these PostHog events when users come from email links:

### 1. Email Event Page View

**Event**: `email_event_page_view`
**Triggered**: When user lands on event page from email link
**Properties**:

- `event_id` - Event ID
- `event_name` - Event name
- `organizer` - Event organizer
- `utm_source` - "email"
- `utm_medium` - Email campaign medium
- `utm_campaign` - Campaign name
- `utm_content` - Content identifier

### 2. Email Ticket Purchase Start

**Event**: `email_ticket_purchase_start`  
**Triggered**: When user clicks "Buy Tickets" after coming from email
**Properties**: Same as above

### 3. Email Ticket Purchase Complete

**Event**: `email_ticket_purchase_complete`
**Triggered**: When user successfully completes ticket purchase
**Properties**:

- All UTM parameters
- `event_id` - Event ID
- `order_id` - Order ID
- `total_amount` - Final purchase amount
- `subtotal` - Subtotal before fees
- `fees` - Processing fees
- `total_tickets` - Number of tickets purchased
- `user_email` - Purchaser email
- `is_free` - Whether tickets were free
- `promotion_applied` - Any discount code used

## Conversion Funnel Analysis

In PostHog, you can create funnels to analyze email campaign effectiveness:

1. **Funnel Step 1**: `email_event_page_view`
2. **Funnel Step 2**: `email_ticket_purchase_start`
3. **Funnel Step 3**: `email_ticket_purchase_complete`

This shows you:

- How many email recipients visit event pages
- How many start the checkout process
- How many complete purchases
- Conversion rates at each step

## Campaign Segmentation

Use the `utm_campaign` parameter to track different email types:

- `weekly_newsletter` - Regular newsletter promotions
- `event_announcement` - New event announcements
- `reminder_email` - Purchase reminder emails
- `early_bird` - Early bird pricing promotions

## Implementation Details

The tracking is handled by:

- `/src/lib/emailTracking.ts` - Utility functions for tracking
- `/src/app/events/[eventId]/_components/EventDetails.tsx` - Page view tracking
- `/src/hooks/useCheckout.tsx` - Purchase completion tracking

Session storage is used to persist UTM parameters throughout the user journey, ensuring proper attribution even if users navigate between pages.
