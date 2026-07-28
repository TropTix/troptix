import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { getEvents, getEvent, checkInTicket } from '../../services/organizer';
import { TRPCError } from '@trpc/server';

export const organizerRouter = router({
  /**
   * All events the signed-in organizer owns. Platform owners
   * (@usetroptix.com) receive every event regardless of organizerUserId.
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
});
