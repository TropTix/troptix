import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import {
  getEvents,
  getEvent,
  checkInTicket,
  undoCheckinTicket,
} from '../../services/organizer';
import { TRPCError } from '@trpc/server';

export const organizerRouter = router({
  /**
   * All events the signed-in organizer owns. Mobile has no View-as UI, so
   * this is always scoped to the actor's own organizerUserId — including for
   * @usetroptix.com platform-owner accounts (ADR 0018).
   */
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

  /**
   * A single event and its guest list (tickets).
   */
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

  /**
   * Check in a specific ticket.
   */
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
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: e.message,
        });
      }
    }),

  /**
   * Undo a ticket check-in.
   */
  undoCheckInTicket: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await undoCheckinTicket(ctx.prisma, ctx.actor, input.ticketId);
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
