'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/DatePicker';
import { Loader2 } from 'lucide-react';

import {
  createTicketType,
  updateTicketType,
} from '../../_actions/ticketActions';
import {
  TicketTypeFormValues,
  ticketTypeSchema,
} from '@/lib/schemas/ticketSchema';
import { formatCurrency, combineDateTime, formatTime } from '@/lib/dateUtils';
import { PaidWarningBannerForm } from '@/components/PaidWarningBanner';
import { calculateFeesCents, FeeConfig } from '@troptix/api';
const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);

const defaultFormValues: TicketTypeFormValues = {
  name: '',
  description: '',
  price: 0,
  capacity: 100,
  maxPurchasePerUser: 10,
  saleStartsAt: today,
  saleEndsAt: tomorrow,
  ticketingFees: 'PASS_TICKET_FEES',
  discountCode: undefined,
};

interface CreateTicketTypeFormProps {
  eventId: string;
  initialData?: Partial<TicketTypeFormValues> & { id?: string };
  isOrganizer: boolean;
}

export function CreateTicketTypeForm({
  eventId,
  initialData,
  isOrganizer,
}: CreateTicketTypeFormProps) {
  const router = useRouter();
  const isEditMode = !!initialData;
  const [isPending, startTransition] = useTransition();

  // UI-only state for showing/hiding password field
  const [showPasswordField, setShowPasswordField] = useState(
    !!initialData?.discountCode
  );

  const form = useForm<TicketTypeFormValues>({
    resolver: zodResolver(ticketTypeSchema),
    defaultValues: {
      ...defaultFormValues,
      ...initialData,
      saleStartsAt: initialData?.saleStartsAt
        ? new Date(initialData.saleStartsAt)
        : defaultFormValues.saleStartsAt,
      saleEndsAt: initialData?.saleEndsAt
        ? new Date(initialData.saleEndsAt)
        : defaultFormValues.saleEndsAt,
    },
    mode: 'onChange',
  });

  const watchedPrice = form.watch('price');
  const watchedTicketingFees = form.watch('ticketingFees');
  const paidEventsEnabled = isOrganizer;

  let calculatedBuyerPrice: number | null = null;
  let calculatedOrganizerPayout: number | null = null;

  const currentPrice = Number(watchedPrice) || 0;

  if (currentPrice > 0) {
    const baseFee = calculateFeesCents(Math.round(currentPrice * 100)) / 100;

    if (watchedTicketingFees === 'PASS_TICKET_FEES') {
      calculatedBuyerPrice = currentPrice + baseFee;
      calculatedOrganizerPayout = currentPrice;
    } else {
      calculatedBuyerPrice = currentPrice;
      calculatedOrganizerPayout = currentPrice - baseFee;
    }
  }

  const onSubmit: SubmitHandler<TicketTypeFormValues> = (values) => {
    if (!showPasswordField) {
      values.discountCode = undefined;
    }
    startTransition(async () => {
      try {
        let result;
        if (isEditMode && initialData?.id) {
          result = await updateTicketType(initialData.id, values);
        } else {
          result = await createTicketType(eventId, values);
        }

        if (result.success) {
          toast.success(
            isEditMode
              ? 'Ticket updated successfully!'
              : 'Ticket created successfully!'
          );
          router.push(`/organizer/events/${eventId}/tickets`);
          router.refresh();
        } else {
          toast.error(result.error || 'An unknown error occurred.');
        }
      } catch (error) {
        console.error('Submission error:', error);
        toast.error('An unexpected error occurred during submission.');
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ticket Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., General Admission, VIP Pass"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The public name of the ticket type.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter a short description for this ticket type..."
                  className="resize-none"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>
                Optional details about the ticket (e.g., what&apos;s included).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price ($)</FormLabel>
              <FormControl>
                <Input
                  disabled={!paidEventsEnabled}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...field}
                />
              </FormControl>
              <FormDescription className="flex flex-col gap-2">
                Set to 0 for free tickets.
                {!paidEventsEnabled && <PaidWarningBannerForm />}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity Available</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="100"
                    {...field}
                  />
                </FormControl>
                <FormDescription>Total tickets of this type.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxPurchasePerUser"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Per Order</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="10"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Max tickets per customer order.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="saleStartsAt"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Sale Starts</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <DatePicker
                      date={field.value}
                      onDateChange={(newDate) => {
                        const currentTime = formatTime(field.value);
                        const combined = combineDateTime(newDate, currentTime);
                        field.onChange(combined); // Update RHF state with combined DateTime
                      }}
                      placeholder="Select start date"
                    />
                  </FormControl>
                  <FormControl>
                    <Input
                      type="time"
                      defaultValue={formatTime(field.value)}
                      onChange={(e) => {
                        const time = e.target.value;
                        const currentDate = field.value;
                        const combined = combineDateTime(currentDate, time);
                        form.setValue('saleStartsAt', combined as Date, {
                          shouldValidate: true,
                        });
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

          <FormField
            control={form.control}
            name="saleEndsAt"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Sale Ends</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <DatePicker
                      date={field.value}
                      onDateChange={(newDate) => {
                        const currentTime = formatTime(field.value);
                        const combined = combineDateTime(newDate, currentTime);
                        field.onChange(combined);
                      }}
                      placeholder="Select end date"
                    />
                  </FormControl>
                  <FormControl>
                    <Input
                      type="time"
                      defaultValue={formatTime(field.value)}
                      onChange={(e) => {
                        const time = e.target.value;
                        const currentDate = field.value;
                        const combined = combineDateTime(currentDate, time);
                        form.setValue('saleEndsAt', combined as Date, {
                          shouldValidate: true,
                        });
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
        </div>

        <div className="flex flex-col rounded-lg border p-4 gap-4">
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Password Protected</FormLabel>
              <FormDescription>
                Require a password for customers to access this ticket type.
              </FormDescription>
            </div>
            <Switch
              checked={showPasswordField}
              onCheckedChange={(checked) => {
                setShowPasswordField(checked);
              }}
            />
          </div>

          {showPasswordField && (
            <FormField
              control={form.control}
              name="discountCode"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Enter password for this ticket"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {(Number(watchedPrice) || 0) > 0 && (
          <FormField
            control={form.control}
            name="ticketingFees"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Ticketing Fees</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex flex-col space-y-1"
                  >
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="PASS_TICKET_FEES" />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Pass fees on to buyer (Recommended)
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="ABSORB_TICKET_FEES" />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Absorb fees into ticket price
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormDescription>
                  Choose how ticketing platform fees are handled.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {(Number(watchedPrice) || 0) > 0 && (
          <div className="mt-4 p-4 border rounded-md bg-muted/40 space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Fee Preview (Estimate)
            </h4>
            <div className="flex justify-between items-center text-sm">
              <span>Buyer Pays:</span>
              <span className="font-semibold">
                {formatCurrency(calculatedBuyerPrice)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span>You Receive:</span>
              <span className="font-semibold">
                {formatCurrency(calculatedOrganizerPayout)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              *Based on an estimated {FeeConfig.PERCENTAGE * 100}% +{' '}
              {formatCurrency(FeeConfig.FIXED_CENTS / 100)} fee.
            </p>
          </div>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait...
            </>
          ) : isEditMode ? (
            'Save Changes'
          ) : (
            'Create Ticket Type'
          )}
        </Button>
      </form>
    </Form>
  );
}
