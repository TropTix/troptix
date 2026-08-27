import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  checkInTicket,
  getEvent,
  getEvents,
  undoCheckInTicket,
} from '../../services/organizer';
import { protectedProcedure, router } from '../trpc';

export const organizerRouter = router({
  /** Ownership-only — deliberately no platform-owner bypass (ADR 0018). */
  events: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getEvents(ctx.prisma, ctx.actor);
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: e.message,
      });
    }
  }),

  event: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await getEvent(ctx.prisma, ctx.actor, input.id);
      } catch (e: any) {
        if (e.message === 'NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        if (e.message === 'UNAUTHORIZED') {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: e.message,
        });
      }
    }),

  checkInTicket: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await checkInTicket(ctx.prisma, ctx.actor, input.ticketId);
      } catch (e: any) {
        if (e.message === 'NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        if (e.message === 'UNAUTHORIZED') {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        if (e.message === 'ALREADY_CHECKED_IN') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ticket already checked in',
          });
        }
        if (e.message === 'TICKET_NOT_VALID') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This ticket is not valid for entry',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: e.message,
        });
      }
    }),

  undoCheckInTicket: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await undoCheckInTicket(ctx.prisma, ctx.actor, input.ticketId);
      } catch (e: any) {
        if (e.message === 'NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        if (e.message === 'UNAUTHORIZED') {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        if (e.message === 'NOT_CHECKED_IN') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ticket is not checked in',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: e.message,
        });
      }
    }),
});
