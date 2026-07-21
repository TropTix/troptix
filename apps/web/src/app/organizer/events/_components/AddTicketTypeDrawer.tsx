'use client';

import React, { useEffect, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
  SheetFooter,
} from '@/components/ui/sheet';
import { DatePicker } from '@/components/DatePicker';
import { HelpCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  ticketTypeSchema,
  TicketTypeFormValues,
} from '@/lib/schemas/ticketSchema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { combineDateTime } from '@/lib/dateUtils';
import { formatTime } from '@/lib/dateUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { PaidWarningBannerForm } from '@/components/PaidWarningBanner';
import { calculateFeesCents, FeeConfig } from '@troptix/api';

// The gross ↔ display pair, linked through the platform fee (8% + $0.50).
// PASS puts the fee on top of gross; ABSORB leaves the sticker at gross.
function displayCentsOf(
  grossCents: number,
  fees: TicketTypeFormValues['ticketingFees']
): number {
  return fees === 'PASS_TICKET_FEES'
    ? grossCents + calculateFeesCents(grossCents)
    : grossCents;
}

function grossCentsFromDisplay(
  displayCents: number,
  fees: TicketTypeFormValues['ticketingFees']
): number {
  if (fees !== 'PASS_TICKET_FEES') return displayCents;
  return Math.max(
    0,
    Math.round(
      (displayCents - FeeConfig.FIXED_CENTS) / (1 + FeeConfig.PERCENTAGE)
    )
  );
}

const toDollars = (cents: number) => (cents / 100).toFixed(2);

interface AddTicketTypeDrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Receives the validated values (plus the row id when editing). May be
   * sync (the create form's in-memory array) or async (Screen E's server
   * actions) — an async result of `{ success: false }` keeps the drawer open
   * and shows the error.
   */
  onSubmit: (
    data: TicketTypeFormValues & { id?: string }
  ) =>
    | void
    | { success: boolean; error?: string }
    | Promise<void | { success: boolean; error?: string }>;
  initialData?: Partial<TicketTypeFormValues> & { id?: string };
  ticketSchema: z.ZodType<TicketTypeFormValues>;
  /** Default sale-window end for new tickets — the event's end, so day-of sales work untouched. */
  defaultSaleEnd: Date;
  paidEventsEnabled: boolean;
}

// The one ticket-type editor: the create-event form feeds it an in-memory
// array; Screen E's manager feeds it the server actions.
export function AddTicketTypeDrawer({
  open,
  setOpen,
  onSubmit: onSubmitProp,
  initialData,
  defaultSaleEnd,
  paidEventsEnabled,
}: AddTicketTypeDrawerProps) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  // Complete on purpose: the per-open reset seeds {...defaultValues,
  // ...initialData}, so any field missing here would leak the previous
  // open's value into a fresh drawer.
  const defaultValues = {
    name: 'Default Ticket',
    description: '',
    price: 0,
    capacity: 100,
    maxPurchasePerUser: 10,
    discountCode: undefined,
    ticketingFees: 'PASS_TICKET_FEES' as const,
    saleStartsAt: today,
    // Clamped: on an already-ended event the raw event end would seed a
    // window that can never pass the ends-after-starts refine.
    saleEndsAt: defaultSaleEnd > tomorrow ? defaultSaleEnd : tomorrow,
  };
  const form = useForm<TicketTypeFormValues>({
    resolver: zodResolver(ticketTypeSchema),
    defaultValues: initialData || defaultValues,
  });

  // Free is an explicit choice; paid pricing is entered from either end
  // (gross = what you set/earn, display = what the buyer pays), linked by
  // the fee math. Gross lives in the form (`price`); display is derived.
  const [isFree, setIsFree] = useState(true);
  const [displayInput, setDisplayInput] = useState('');

  // The drawer stays mounted across opens, so the form must be re-seeded per
  // open — otherwise editing row A shows whatever was last typed (and Save
  // would overwrite A with it). Seed data without an id is a duplicate: a
  // create pre-filled from an existing row.
  useEffect(() => {
    if (open) {
      const seed = { ...defaultValues, ...initialData };
      form.reset(seed);
      const grossCents = Math.round((seed.price ?? 0) * 100);
      setIsFree(grossCents === 0);
      setDisplayInput(
        grossCents > 0
          ? toDollars(displayCentsOf(grossCents, seed.ticketingFees))
          : ''
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  const syncDisplayFromGross = (
    grossDollars: unknown,
    fees: TicketTypeFormValues['ticketingFees'] = form.getValues(
      'ticketingFees'
    )
  ) => {
    const gross = Number(grossDollars);
    setDisplayInput(
      Number.isFinite(gross) && gross > 0
        ? toDollars(displayCentsOf(Math.round(gross * 100), fees))
        : ''
    );
  };

  const handleDisplayChange = (raw: string) => {
    setDisplayInput(raw);
    const display = Number(raw);
    if (!Number.isFinite(display)) return;
    const grossCents = grossCentsFromDisplay(
      Math.round(display * 100),
      form.getValues('ticketingFees')
    );
    form.setValue('price', +(grossCents / 100).toFixed(2), {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleFreeToggle = (free: boolean) => {
    setIsFree(free);
    if (free) {
      form.setValue('price', 0, { shouldValidate: true, shouldDirty: true });
      setDisplayInput('');
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const onValidSubmit = async (data: TicketTypeFormValues) => {
    const dataToSubmit = initialData?.id
      ? { ...data, id: initialData.id }
      : data;
    setSubmitting(true);
    try {
      const result = await onSubmitProp(dataToSubmit);
      if (result && result.success === false) {
        toast.error(result.error || 'Failed to save ticket type.');
        return;
      }
      setOpen(false);
    } catch {
      // A thrown (not returned) failure — e.g. the action invocation itself
      // died on the network. Without this the rejection escapes silently.
      toast.error(
        'Something went wrong saving the ticket — check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // A field error can sit below the drawer's scroll fold — surface the first
  // one where it's seen.
  const onInvalidSubmit = (errors: FieldErrors<TicketTypeFormValues>) => {
    const first = Object.values(errors)[0];
    toast.error(first?.message || 'Please fix the highlighted fields.');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="fit-content flex flex-col h-full">
        <SheetHeader className="text-left">
          <SheetTitle>
            {initialData?.id ? 'Edit Ticket' : 'Add New Ticket'}
          </SheetTitle>
          <SheetDescription>
            Configure ticket details. Click save when done.
          </SheetDescription>
          {!paidEventsEnabled && <PaidWarningBannerForm />}
        </SheetHeader>

        <Form {...form}>
          <form
            id="drawer-ticket-form"
            onSubmit={form.handleSubmit(onValidSubmit, onInvalidSubmit)}
            className="px-4 py-2 space-y-4 overflow-y-auto flex-grow"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ticket Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., General Admission" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-3 rounded-md border px-3 py-3">
              <div className="flex flex-1 items-center gap-2">
                <span className="text-sm font-medium">
                  Make this a free ticket
                </span>
                {!paidEventsEnabled && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-background">
                        <p>
                          Paid tickets are only available to approved
                          organizers.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <Switch
                checked={isFree}
                onCheckedChange={handleFreeToggle}
                disabled={!paidEventsEnabled}
                aria-label="Make this a free ticket"
              />
            </div>

            {!isFree && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross Price ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            syncDisplayFromGross(e.target.value);
                          }}
                          value={field.value ?? ''}
                          disabled={!paidEventsEnabled}
                        />
                      </FormControl>
                      <FormDescription>
                        What you earn per sale when fees are passed on.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Display Price ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={displayInput}
                      onChange={(e) => handleDisplayChange(e.target.value)}
                      disabled={!paidEventsEnabled}
                    />
                  </FormControl>
                  <FormDescription>
                    What the buyer sees and pays, including the TropTix fee.
                  </FormDescription>
                </FormItem>
              </div>
            )}

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      placeholder="100"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value)}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ticket Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Includes access to main stage"
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mt-4 space-y-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                Advanced options
              </p>
              <div>
                <FormField
                  control={form.control}
                  name="saleStartsAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Sale Starts *</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          {/* DatePicker handles the date part */}
                          <DatePicker
                            date={field.value}
                            onDateChange={(newDate) => {
                              const currentTime = formatTime(field.value);
                              const combined = combineDateTime(
                                newDate,
                                currentTime
                              );
                              field.onChange(combined);
                            }}
                            placeholder="Select start date"
                          />
                        </FormControl>
                        <FormControl>
                          {/* Separate input for time */}
                          <Input
                            type="time"
                            value={formatTime(field.value)}
                            onChange={(e) => {
                              const time = e.target.value;
                              const currentDate = field.value;
                              const combined = combineDateTime(
                                currentDate,
                                time
                              );
                              field.onChange(combined);
                            }}
                            className="w-[120px]"
                          />
                        </FormControl>
                      </div>
                      <FormDescription className="pt-1">
                        When tickets become available.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="saleEndsAt"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Sale Ends *</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        {/* DatePicker handles the date part */}
                        <DatePicker
                          date={field.value}
                          onDateChange={(newDate) => {
                            const currentTime = formatTime(field.value);
                            const combined = combineDateTime(
                              newDate,
                              currentTime
                            );
                            field.onChange(combined);
                          }}
                          placeholder="Select end date"
                        />
                      </FormControl>
                      <FormControl>
                        {/* Separate input for time */}
                        <Input
                          type="time"
                          value={formatTime(field.value)}
                          onChange={(e) => {
                            const time = e.target.value;
                            const currentDate = field.value;
                            const combined = combineDateTime(currentDate, time);
                            field.onChange(combined);
                          }}
                          className="w-[120px]"
                        />
                      </FormControl>
                    </div>
                    <FormDescription className="pt-1">
                      When ticket sales stop.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxPurchasePerUser"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Max Tickets Per Order{' '}
                      <span className="text-xs text-muted-foreground">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g., 4"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === '' ? undefined : e.target.value
                          )
                        }
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Access code{' '}
                      <span className="text-xs text-muted-foreground">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., VIPLIST"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value || undefined)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Buyers must enter this code at checkout to unlock this
                      ticket. Leave blank for a public ticket.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isFree && (
                <FormField
                  control={form.control}
                  name="ticketingFees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticketing Fee Structure</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(value: string) => {
                            field.onChange(value);
                            // Who eats the fee changes what the buyer pays.
                            syncDisplayFromGross(
                              form.getValues('price'),
                              value as TicketTypeFormValues['ticketingFees']
                            );
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select fee handling" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PASS_TICKET_FEES">
                              Pass fees on to buyer (Recommended)
                            </SelectItem>
                            <SelectItem value="ABSORB_TICKET_FEES">
                              Absorb fees into ticket price
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormDescription>
                        Choose how ticketing platform fees are handled.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </form>
        </Form>

        <SheetFooter className="pt-2 border-t justify-end gap-2">
          <Button type="submit" form="drawer-ticket-form" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData?.id ? 'Save Changes' : 'Add Ticket'}
          </Button>
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
