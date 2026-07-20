'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray, FieldErrors, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Edit, Loader2, PlusCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { eventFormSchema, EventFormValues } from '@/lib/schemas/eventSchema';

import {
  ticketTypeSchema,
  TicketTypeFormValues,
} from '@/lib/schemas/ticketSchema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AddTicketTypeDrawer } from '../_components/AddTicketTypeDrawer';
import { DatePicker } from '@/components/DatePicker';
import { formatTime, combineDateTime } from '@/lib/dateUtils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { usePlacesWidget } from 'react-google-autocomplete';
import { EventImageUploader } from '../_components/EventImageUpload';
import { PublishRequirements } from '@/components/PublishRequirements';
import { createEvent, updateEvent } from '../_actions/eventActions';
import { PaidWarningBannerForm } from '@/components/PaidWarningBanner';

interface EventFormProps {
  initialData?: EventFormValues | null;
  /** Present in edit mode — its absence is what makes this a create form. */
  eventId?: string;
  ticketTypes?: TicketTypeFormValues[];
  isDraft?: boolean;
  paidEventsEnabled: boolean;
  /** The organizer's brand — this event's host. Editable at /organizer/profile. */
  organizationName?: string;
}

/** The drawer's subject: an existing ticket row, or a fresh one when index is null. */
type DrawerState = {
  index: number | null;
  data: Partial<TicketTypeFormValues>;
};

function defaultEventValues(): EventFormValues {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = new Date(tomorrow);
  nextDay.setDate(nextDay.getDate() + 1);
  return {
    eventName: '',
    description: '',
    startsAt: tomorrow,
    endsAt: nextDay,
    venue: '',
    address: '',
    country: '',
    countryCode: '',
    latitude: null,
    longitude: null,
    tickets: [],
    imageUrl: null,
  };
}

export default function EventForm({
  initialData,
  eventId,
  // Server-provided ticket types + draft status feed publish validation on edit.
  ticketTypes,
  isDraft,
  paidEventsEnabled,
  organizationName,
}: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const isEditing = !!eventId;
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: initialData ?? defaultEventValues(),
    mode: 'onChange',
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'tickets',
  });

  const handleDrawerSubmit = (
    ticketData: TicketTypeFormValues & { id?: string }
  ) => {
    // Strip the RHF-array id so it never masquerades as a DB id.
    const { id: _rhfId, ...dataToSave } = ticketData;
    if (drawer?.index != null) {
      update(drawer.index, dataToSave);
    } else {
      append(dataToSave);
    }
  };

  const handlePlaceSelected = (
    place: google.maps.places.PlaceResult | null
  ) => {
    if (!place) return;

    const countryComponent = place.address_components?.find((c) =>
      c.types.includes('country')
    );
    // Null (not 0) when geometry is missing — 0,0 is the Gulf-of-Guinea "null
    // island" that the map guard would otherwise center on.
    const location = place.geometry?.location;
    const formattedAddress = place.formatted_address ?? place.name ?? '';

    form.setValue('address', formattedAddress, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue('country', countryComponent?.long_name || undefined, {
      shouldDirty: true,
    });
    form.setValue('countryCode', countryComponent?.short_name || undefined, {
      shouldDirty: true,
    });
    form.setValue('latitude', location ? location.lat() : null, {
      shouldDirty: true,
    });
    form.setValue('longitude', location ? location.lng() : null, {
      shouldDirty: true,
    });

    if (
      place.name &&
      place.name !== formattedAddress.split(',')[0] &&
      !form.getValues('venue')
    ) {
      form.setValue('venue', place.name, { shouldDirty: true });
    }
  };

  const { ref: placesRef } = usePlacesWidget({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    onPlaceSelected: handlePlaceSelected,
    options: {
      componentRestrictions: { country: ['jm', 'us', 'ca', 'gb', 'tt'] },
      fields: [
        'address_components',
        'geometry.location',
        'formatted_address',
        'name',
      ],
      types: ['geocode', 'establishment'],
    },
  });

  const onSubmit = (data: EventFormValues) => {
    startTransition(async () => {
      try {
        const result = eventId
          ? await updateEvent(eventId, data)
          : await createEvent(data);

        if (result.success && result.eventId) {
          toast.success(
            isEditing
              ? 'Event updated successfully!'
              : 'Event created successfully!'
          );
          router.push(`/organizer/events/${result.eventId}`);
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

  const onError = (errors: FieldErrors<EventFormValues>) => {
    toast.error(
      `Form validation failed. Please check the fields: ${Object.keys(errors).join(', ')}`
    );
  };

  return (
    <div className="space-y-8">
      {!paidEventsEnabled && <PaidWarningBannerForm />}
      <div className="flex flex-col md:flex-row gap-8">
        <div className="md:w-1/3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Image</CardTitle>

              <CardDescription>Upload an image for your event.</CardDescription>
            </CardHeader>

            <CardContent>
              <EventImageUploader
                currentImageUrl={form.watch('imageUrl')}
                onUploadComplete={(url) =>
                  form.setValue('imageUrl', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
            </CardContent>
          </Card>

          {isEditing && isDraft ? (
            <PublishRequirements
              eventData={{
                id: eventId || '',
                name: form.watch('eventName'),
                description: form.watch('description'),
                organizer: organizationName ?? '',
                startsAt: form.watch('startsAt'),
                endsAt: form.watch('endsAt'),
                venue: form.watch('venue'),
                address: form.watch('address'),
                imageUrl: form.watch('imageUrl'),
                ticketTypes: ticketTypes ?? [],
              }}
            />
          ) : null}
        </div>

        {/* Right Column: Event Form */}

        <div className="md:w-2/3">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, onError)}
              className="space-y-8"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Event Details</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="eventName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Name</FormLabel>

                        <FormControl>
                          <Input
                            placeholder="e.g., Annual Summer Concert"
                            {...field}
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
                        <FormLabel>Description</FormLabel>

                        <FormControl>
                          <Textarea
                            placeholder="Tell attendees about the event..."
                            rows={4}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem>
                    <FormLabel>Hosted by</FormLabel>
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium">
                      {organizationName ?? 'Your organizer profile'}
                    </div>
                    <FormDescription>
                      Events are hosted by your organization.{' '}
                      <Link
                        href="/organizer/profile"
                        className="underline underline-offset-2 hover:text-primary"
                      >
                        Edit your profile
                      </Link>
                      .
                    </FormDescription>
                  </FormItem>

                  <div className="grid md:grid-cols-2 gap-4">
                    <DateTimeField
                      control={form.control}
                      name="startsAt"
                      label="Start Date"
                      placeholder="Select start date"
                    />
                    <DateTimeField
                      control={form.control}
                      name="endsAt"
                      label="End Date"
                      placeholder="Select end date"
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address / Location Details</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Start typing address, e.g., Hope Road, Kingston"
                            {...field}
                            ref={(el) => {
                              field.ref(el);
                              (
                                placesRef as React.MutableRefObject<HTMLInputElement | null>
                              ).current = el;
                            }}
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="venue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venue / Location</FormLabel>

                        <FormControl>
                          <Input
                            placeholder="e.g., Kingston Waterfront or Online"
                            {...field}
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {!isEditing && (
                <Card>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="float-right mt-4 mr-4"
                    onClick={() =>
                      setDrawer({
                        index: null,
                        data: { name: '', price: 0, capacity: 1 },
                      })
                    }
                    disabled={isPending}
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Tickets</CardTitle>
                        <CardDescription>
                          Add tickets for your event. This is optional, you can
                          add them later.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {fields.length > 0 ? (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Price ($)</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead className="text-right">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fields.map((field, index) => (
                              <TableRow key={field.id}>
                                <TableCell className="font-medium">
                                  {field.name}
                                </TableCell>
                                <TableCell>
                                  ${field.price?.toFixed(2)}
                                </TableCell>
                                <TableCell>{field.capacity}</TableCell>
                                <TableCell className="text-right space-x-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      setDrawer({
                                        index,
                                        data: { ...fields[index] },
                                      })
                                    }
                                    disabled={isPending}
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => remove(index)}
                                    type="button"
                                    disabled={isPending}
                                  >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Remove</span>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No ticket types added yet. Add one to publish.
                      </p>
                    )}
                    {form.formState.errors.tickets &&
                      !Array.isArray(form.formState.errors.tickets) && (
                        <p className="text-sm font-medium text-destructive mt-2">
                          {form.formState.errors.tickets.message ||
                            form.formState.errors.tickets.root?.message}
                        </p>
                      )}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={isPending || !form.formState.isValid}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                      {isEditing ? 'Saving...' : 'Creating...'}
                    </>
                  ) : isEditing ? (
                    'Save Changes'
                  ) : (
                    'Create Event'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
      {!isEditing && (
        <AddTicketTypeDrawer
          paidEventsEnabled={paidEventsEnabled}
          open={drawer !== null}
          setOpen={(open) => !open && setDrawer(null)}
          onSubmit={handleDrawerSubmit}
          initialData={drawer?.data}
          ticketSchema={ticketTypeSchema}
          eventStartDate={form.getValues('startsAt')}
        />
      )}
    </div>
  );
}

/**
 * One date+time control writing a single Date field. Reading the time out
 * (`formatTime`) and folding it back in (`combineDateTime`) is a matched pair
 * (CLAUDE.md "Dates and times") — keeping both halves here, used by start and
 * end alike, is what stops the pair from drifting apart per-field.
 */
function DateTimeField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<EventFormValues>;
  name: 'startsAt' | 'endsAt';
  label: string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={control}
        name={name}
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel>{label}</FormLabel>
            <div className="flex flex-row gap-2 items-center">
              <FormControl>
                <DatePicker
                  date={field.value}
                  onDateChange={(newDate) =>
                    field.onChange(
                      combineDateTime(newDate, formatTime(field.value))
                    )
                  }
                  placeholder={placeholder}
                />
              </FormControl>
              <FormControl>
                <Input
                  type="time"
                  value={formatTime(field.value)}
                  onChange={(e) =>
                    field.onChange(combineDateTime(field.value, e.target.value))
                  }
                  className="w-full sm:w-[120px]"
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
