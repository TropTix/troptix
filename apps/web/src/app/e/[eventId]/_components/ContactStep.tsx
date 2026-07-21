'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import {
  reservationContactSchema,
  type ReservationContact,
} from '@troptix/api';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export default function ContactStep({
  defaultValues,
  isFree,
  submitting,
  error,
  eventName,
  onBack,
  onSubmit,
}: {
  defaultValues: ReservationContact;
  isFree: boolean;
  submitting: boolean;
  error: string | null;
  eventName: string;
  onBack: () => void;
  onSubmit: (contact: ReservationContact) => void | Promise<void>;
}) {
  const form = useForm<ReservationContact>({
    resolver: zodResolver(reservationContactSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight">
              Your details
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {eventName}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input placeholder="First name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input placeholder="Last name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Your {isFree ? 'RSVP confirmation' : 'tickets'} and receipt are sent
            here.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t border-border px-5 py-4">
          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting
              ? 'Confirming…'
              : isFree
                ? 'Complete RSVP'
                : 'Continue to payment'}
          </button>
        </div>
      </form>
    </Form>
  );
}
