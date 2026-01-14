import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { Resend } from 'resend';
import { createElement } from 'react';
import { render } from '@react-email/components';
import prisma from '../src/server/prisma';
import { generateId } from '../src/lib/utils';
import ComplementaryTicketEmail from '../emails/ComplementaryTicketEmail';
import { TicketType, OrderStatus, TicketStatus, Prisma } from '@prisma/client';

// ============================================================================
// CONSTANTS
// ============================================================================

const BATCH_SIZE = 50; // Orders per database transaction
const EMAIL_BATCH_SIZE = 100; // Resend batch API limit
const TICKET_TYPE_NAME = 'Two Day Ticket - Complementary';
const EMAIL_FROM = 'TropTix <info@usetroptix.com>';
const REQUIRED_CSV_COLUMNS = ['email', 'firstName', 'lastName'];

// ============================================================================
// TYPES
// ============================================================================

interface CsvRecord {
  email: string;
  firstName: string;
  lastName: string;
}

interface EmailRecipient {
  email: string;
  firstName: string;
  lastName: string;
}

interface ComplementaryOrderInput {
  orderId: string;
  ticketId: string;
  ticketTypeId: string;
  eventId: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface EventDetails {
  id: string;
  name: string;
  imageUrl: string | null;
  startDate: Date;
  endDate: Date;
  address: string | null;
  description: string;
}

interface TicketTypeDetails {
  id: string;
  name: string;
}

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface SummaryStats {
  totalRecipients: number;
  duplicatesRemoved: number;
  uniqueRecipients: number;
  ordersCreated: number;
  ordersFailed: number;
  emailsSent: number;
  emailsFailed: number;
  failedEmails: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build Prisma create input for complementary orders
 * This replaces the outdated getPrismaCreateComplementaryOrderQuery helper
 */
function buildComplementaryOrderData(
  input: ComplementaryOrderInput
): Prisma.OrdersCreateInput {
  return {
    id: input.orderId,
    // Required fields
    total: 0,
    subtotal: 0,
    fees: 0,
    status: OrderStatus.COMPLETED,

    // Customer info
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,

    // No payment info for complementary
    stripePaymentId: undefined,
    stripeCustomerId: undefined,
    cardType: undefined,
    cardLast4: undefined,

    // No billing info needed
    telephoneNumber: undefined,
    billingAddress1: undefined,
    billingAddress2: undefined,
    billingCity: undefined,
    billingCountry: undefined,
    billingZip: undefined,
    billingState: undefined,

    // Links
    ticketsLink: undefined,
    name: undefined,

    // Relations
    event: {
      connect: { id: input.eventId },
    },
    tickets: {
      create: [
        {
          id: input.ticketId,
          eventId: input.eventId,
          ticketTypeId: input.ticketTypeId,
          status: TicketStatus.AVAILABLE,
          ticketsType: TicketType.COMPLEMENTARY,
          total: 0,
          subtotal: 0,
          fees: 0,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
      ],
    },
    // Note: userId is intentionally omitted (guest orders)
  };
}

/**
 * Parse command-line arguments
 */
function parseArguments(): { eventId: string; csvFilePath: string } {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Error: Missing required arguments\n');
    console.log(
      'Usage: tsx scripts/bulk-complementary-tickets.ts <eventId> <csvFilePath>'
    );
    console.log(
      '\nExample: tsx scripts/bulk-complementary-tickets.ts ABC123XYZ recipients.csv'
    );
    process.exit(1);
  }

  const [eventId, csvFilePath] = args;
  return { eventId, csvFilePath };
}

/**
 * Validate CSV file exists
 */
function validateCsvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: CSV file not found at path: ${filePath}`);
    process.exit(1);
  }
}

/**
 * Parse CSV file and validate columns
 */
function parseCsvFile(filePath: string): CsvRecord[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRecord[];

    // Validate required columns exist
    if (records.length === 0) {
      console.error('❌ Error: CSV file is empty');
      process.exit(1);
    }

    const firstRecord = records[0];
    const missingColumns = REQUIRED_CSV_COLUMNS.filter(
      (col) => !(col in firstRecord)
    );

    if (missingColumns.length > 0) {
      console.error(
        `❌ Error: CSV is missing required columns: ${missingColumns.join(', ')}`
      );
      console.log(`\nRequired columns: ${REQUIRED_CSV_COLUMNS.join(', ')}`);
      process.exit(1);
    }

    return records;
  } catch (error: any) {
    console.error('❌ Error parsing CSV file:', error?.message);
    process.exit(1);
  }
}

/**
 * Deduplicate emails (case-insensitive)
 */
function deduplicateEmails(records: CsvRecord[]): EmailRecipient[] {
  const emailMap = new Map<string, EmailRecipient>();
  const duplicates: string[] = [];

  for (const record of records) {
    const emailLower = record.email.toLowerCase().trim();

    if (!emailMap.has(emailLower)) {
      emailMap.set(emailLower, {
        email: record.email.trim(),
        firstName: record.firstName.trim(),
        lastName: record.lastName.trim(),
      });
    } else {
      duplicates.push(record.email);
    }
  }

  if (duplicates.length > 0) {
    console.log(`   Duplicates removed: ${duplicates.length}`);
    console.log(
      `   Duplicate emails: ${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}`
    );
  }

  return Array.from(emailMap.values());
}

/**
 * Validate event exists and return details
 */
async function validateEvent(eventId: string): Promise<EventDetails> {
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      startDate: true,
      endDate: true,
      address: true,
      description: true,
    },
  });

  if (!event) {
    console.error(`❌ Error: Event with ID "${eventId}" not found`);
    process.exit(1);
  }

  return event;
}

/**
 * Create complementary ticket type
 */
async function createTicketType(
  eventId: string,
  quantity: number,
  event: EventDetails
): Promise<TicketTypeDetails> {
  // Check if ticket type already exists
  const existingTicketType = await prisma.ticketTypes.findFirst({
    where: {
      eventId: eventId,
      name: TICKET_TYPE_NAME,
      ticketType: TicketType.FREE,
    },
  });

  if (existingTicketType) {
    console.error(
      `\n❌ Error: A complementary ticket type already exists for this event`
    );
    console.error(`   Existing ticket type ID: ${existingTicketType.id}`);
    console.error(
      `   Please delete the existing ticket type or use a different event.`
    );
    process.exit(1);
  }

  const ticketType = await prisma.ticketTypes.create({
    data: {
      name: TICKET_TYPE_NAME,
      ticketType: TicketType.FREE,
      quantity: quantity,
      price: 0,
      maxPurchasePerUser: 1,
      saleStartDate: new Date(
        event.startDate.getTime() - 365 * 24 * 60 * 60 * 1000
      ),
      saleEndDate: event.endDate || event.startDate,
      ticketingFees: 'PASS_TICKET_FEES',
      description: `Complimentary tickets - Bulk created ${new Date().toISOString()}`,
      eventId: eventId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  return ticketType;
}

/**
 * Create orders in batches
 */
async function createOrdersBatched(
  recipients: EmailRecipient[],
  ticketType: TicketTypeDetails,
  eventId: string
): Promise<string[]> {
  const batches = chunkArray(recipients, BATCH_SIZE);
  const createdOrderIds: string[] = [];
  const failedRecipients: EmailRecipient[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `   Batch ${i + 1}/${batches.length}: Creating ${batch.length} orders...`
    );

    try {
      const batchOrderIds = await prisma.$transaction(
        async (tx) => {
          const orderIds: string[] = [];

          for (const recipient of batch) {
            const orderId = generateId();
            const ticketId = generateId();

            const orderData = buildComplementaryOrderData({
              orderId,
              ticketId,
              ticketTypeId: ticketType.id,
              eventId,
              email: recipient.email,
              firstName: recipient.firstName,
              lastName: recipient.lastName,
            });

            await tx.orders.create({ data: orderData });
            orderIds.push(orderId);
          }

          // Update quantitySold for the ticket type
          await tx.ticketTypes.update({
            where: { id: ticketType.id },
            data: {
              quantitySold: { increment: batch.length },
            },
          });

          return orderIds;
        },
        {
          maxWait: 10000, // 10 seconds
          timeout: 30000, // 30 seconds
        }
      );

      createdOrderIds.push(...batchOrderIds);
      console.log(
        `   ✓ Batch ${i + 1} complete (${batchOrderIds.length} orders)`
      );
    } catch (error: any) {
      console.error(`   ✗ Batch ${i + 1} failed:`, error?.message);
      console.error(
        `   Failed recipients: ${batch.map((r) => r.email).join(', ')}`
      );
      failedRecipients.push(...batch);
    }
  }

  if (failedRecipients.length > 0) {
    console.log(
      `\n⚠  ${failedRecipients.length} orders failed. Failed emails saved for retry.`
    );
  }

  return createdOrderIds;
}

/**
 * Render emails for all orders
 */
async function renderEmails(orderIds: string[]): Promise<EmailPayload[]> {
  const emailPayloads: EmailPayload[] = [];

  // Determine base URL based on NODE_ENV
  const baseUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : 'https://usetroptix.com';

  console.log(`   Using base URL: ${baseUrl}`);

  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i];

    try {
      // Query order with full details needed for email template
      const orderForEmail = await prisma.orders.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          total: true,
          subtotal: true,
          fees: true,
          createdAt: true,
          cardLast4: true,
          tickets: {
            select: {
              id: true,
              total: true,
              subtotal: true,
              fees: true,
              ticketType: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  price: true,
                },
              },
            },
          },
          event: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              startDate: true,
              endDate: true,
              address: true,
              description: true,
            },
          },
        },
      });

      if (!orderForEmail || !orderForEmail.email) {
        console.warn(`   ⚠ Skipping order ${orderId}: No email found`);
        continue;
      }

      // Render HTML using ComplementaryTicketEmail template
      const html = await render(
        createElement(ComplementaryTicketEmail, {
          order: orderForEmail,
          baseUrl: baseUrl,
        })
      );

      emailPayloads.push({
        from: EMAIL_FROM,
        to: orderForEmail.email,
        subject: `You've received complimentary tickets for ${orderForEmail.event.name}`,
        html: html,
      });

      // Log progress every 50 emails
      if ((i + 1) % 50 === 0 || i === orderIds.length - 1) {
        console.log(`   Rendered ${i + 1}/${orderIds.length} emails...`);
      }
    } catch (error: any) {
      console.error(
        `   ⚠ Failed to render email for order ${orderId}:`,
        error?.message
      );
    }
  }

  return emailPayloads;
}

/**
 * Send emails in batches using Resend batch API
 */
async function sendEmailsBatched(
  emailPayloads: EmailPayload[]
): Promise<{ sent: number; failed: string[] }> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const emailBatches = chunkArray(emailPayloads, EMAIL_BATCH_SIZE);
  const failedEmails: string[] = [];
  let sentCount = 0;

  for (let i = 0; i < emailBatches.length; i++) {
    const batch = emailBatches[i];
    console.log(
      `   Batch ${i + 1}/${emailBatches.length}: Sending ${batch.length} emails...`
    );

    try {
      const { data, error } = await resend.batch.send(batch);

      if (error) {
        console.error(`   ✗ Email batch ${i + 1} failed:`, error);
        failedEmails.push(...batch.map((b) => b.to));
      } else {
        sentCount += batch.length;
        console.log(`   ✓ Email batch ${i + 1} sent successfully`);
      }

      // Rate limiting delay between batches
      if (i < emailBatches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`   ✗ Email batch ${i + 1} error:`, error.message);
      failedEmails.push(...batch.map((b) => b.to));
    }
  }

  return { sent: sentCount, failed: failedEmails };
}

/**
 * Chunk array into smaller arrays
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Print summary report
 */
function printSummary(stats: SummaryStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('✅ SUMMARY');
  console.log('='.repeat(60));
  console.log(`Recipients processed:     ${stats.totalRecipients}`);
  console.log(`Duplicates removed:       ${stats.duplicatesRemoved}`);
  console.log(`Unique recipients:        ${stats.uniqueRecipients}`);
  console.log(
    `Orders created:           ${stats.ordersCreated} (${Math.round((stats.ordersCreated / stats.uniqueRecipients) * 100)}%)`
  );
  console.log(`Orders failed:            ${stats.ordersFailed}`);
  console.log(
    `Emails sent:              ${stats.emailsSent} (${stats.ordersCreated > 0 ? Math.round((stats.emailsSent / stats.ordersCreated) * 100) : 0}% of created orders)`
  );
  console.log(`Emails failed:            ${stats.emailsFailed}`);

  if (stats.ordersFailed > 0) {
    console.log(
      '\n⚠  Some orders failed to create. Check the logs above for details.'
    );
  }

  if (stats.emailsFailed > 0) {
    console.log('\n⚠  Some emails failed to send:');
    stats.failedEmails.slice(0, 10).forEach((email) => {
      console.log(`   - ${email}`);
    });
    if (stats.failedEmails.length > 10) {
      console.log(`   ... and ${stats.failedEmails.length - 10} more`);
    }
  }

  console.log('='.repeat(60) + '\n');
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  console.log('🚀 Starting bulk complementary ticket creation...\n');

  // 1. Parse and validate arguments
  const { eventId, csvFilePath } = parseArguments();

  console.log('📋 Configuration:');
  console.log(`   Event ID: ${eventId}`);
  console.log(`   CSV File: ${csvFilePath}\n`);

  // 2. Validate CSV file exists
  validateCsvFile(csvFilePath);

  // 3. Parse CSV and deduplicate
  console.log('📊 CSV Processing:');
  const records = parseCsvFile(csvFilePath);
  console.log(`   Total rows: ${records.length}`);

  const uniqueRecipients = deduplicateEmails(records);
  console.log(`   Unique recipients: ${uniqueRecipients.length}\n`);

  // 4. Validate event exists
  const event = await validateEvent(eventId);
  console.log(`✓ Event validated: "${event.name}"\n`);

  // 5. Create ticket type
  console.log('🎫 Creating ticket type...');
  const ticketType = await createTicketType(
    eventId,
    uniqueRecipients.length,
    event
  );
  console.log(
    `✓ Ticket type created: "${ticketType.name}" (ID: ${ticketType.id})\n`
  );

  // 6. Create orders in batches
  console.log(
    `📝 Creating orders (${Math.ceil(uniqueRecipients.length / BATCH_SIZE)} batches of ${BATCH_SIZE})...`
  );
  const createdOrderIds = await createOrdersBatched(
    uniqueRecipients,
    ticketType,
    eventId
  );
  console.log(
    `\n✓ Total orders created: ${createdOrderIds.length}/${uniqueRecipients.length}\n`
  );

  // 7. Render emails
  console.log('📧 Rendering emails...');
  const emailPayloads = await renderEmails(createdOrderIds);
  console.log(`✓ ${emailPayloads.length} emails rendered\n`);

  // 8. Send emails in batches
  console.log(
    `📮 Sending emails (${Math.ceil(emailPayloads.length / EMAIL_BATCH_SIZE)} batches of ${EMAIL_BATCH_SIZE})...`
  );
  const { sent, failed } = await sendEmailsBatched(emailPayloads);
  console.log(`\n✓ Total emails sent: ${sent}/${emailPayloads.length}\n`);

  // 9. Print summary
  const stats: SummaryStats = {
    totalRecipients: records.length,
    duplicatesRemoved: records.length - uniqueRecipients.length,
    uniqueRecipients: uniqueRecipients.length,
    ordersCreated: createdOrderIds.length,
    ordersFailed: uniqueRecipients.length - createdOrderIds.length,
    emailsSent: sent,
    emailsFailed: failed.length,
    failedEmails: failed,
  };

  printSummary(stats);
}

// ============================================================================
// SCRIPT EXECUTION
// ============================================================================

main()
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
