'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, FieldErrors } from 'react-hook-form';
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
} from '@/components/ui/form'; // Added shadcn Form components

import { usePlacesWidget } from 'react-google-autocomplete';
import { EventImageUploader } from '../_components/EventImageUpload';
import { PublishRequirements } from '@/components/PublishRequirements';
import { createEvent, updateEvent } from '../_actions/eventActions'; // Import server actions
import { PaidWarningBannerForm } from '@/components/PaidWarningBanner';

// Adjusted props to explicitly include eventId for updates
interface EventFormProps {
  initialData?: EventFormValues | null; // Keep initialData for form population
  eventId?: string; // Add optional eventId for edit mode identification
  ticketTypes?: TicketTypeFormValues[];
  isDraft?: boolean;
  paidEventsEnabled: boolean;
}

export default function EventForm({
  initialData,
  eventId,
  // Pass the ticketTypes and draft status from the server for publish validation
  ticketTypes,
  isDraft,
  paidEventsEnabled,
}: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition(); // Loading state hook
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTicketIndex, setEditingTicketIndex] = useState<number | null>(
    null
  );
  const [currentTicketData, setCurrentTicketData] = useState<
    Partial<TicketTypeFormValues> | undefined
  >(undefined);

  const isEditing = !!initialData; // Determine mode based on eventId presence
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = new Date(tomorrow);
  nextDay.setDate(nextDay.getDate() + 1);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: initialData ?? {
      // Use initialData if provided, otherwise default
      eventName: '',
      description: '',
      organizer: '',
      startDate: tomorrow,
      endDate: nextDay,
      venue: '',
      address: '',
      country: '',
      countryCode: '',
      latitude: null,
      longitude: null,
      tickets: [],
      imageUrl: null,
    },
    mode: 'onChange',
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'tickets',
  });

  const handleOpenDrawerForNew = () => {
    setEditingTicketIndex(null);
    setCurrentTicketData({ name: '', price: 0, quantity: 1 });
    setIsDrawerOpen(true);
  };

  const handleOpenDrawerForEdit = (index: number) => {
    setEditingTicketIndex(index);
    const ticketToEdit = fields[index];
    setCurrentTicketData({
      ...ticketToEdit,
    });
    setIsDrawerOpen(true);
  };

  // Needed to handle the id field from the RHF array
  type TicketTypeFormValuesWithId = TicketTypeFormValues & { id?: string };

  const handleDrawerSubmit = (ticketData: TicketTypeFormValuesWithId) => {
    const { id: rhfId, ...dataToSave } = ticketData;

    if (editingTicketIndex !== null) {
      update(editingTicketIndex, dataToSave);
      console.log('Updated ticket at index', editingTicketIndex, dataToSave);
    } else {
      append(dataToSave);
      console.log('Appended new ticket:', dataToSave);
    }
  };

  const handleImageUploadComplete = (url: string | null) => {
    form.setValue('imageUrl', url, {
      shouldValidate: true,
      shouldDirty: true,
    });
    console.log('Image URL set in form:', url);
  };

  const handlePlaceSelected = (
    place: google.maps.places.PlaceResult | null
  ) => {
    if (!place) {
      console.warn('Autocomplete returned no place data.');
      return;
    }

    console.log('Place selected:', place);

    let country = '';
    let countryCode = '';
    // Null (not 0) when geometry is missing — 0,0 is the Gulf-of-Guinea "null
    // island" that the map guard would otherwise center on.
    let lat: number | null = null;
    let lng: number | null = null;

    place.address_components?.forEach((component) => {
      if (component.types.includes('country')) {
        country = component.long_name;
        countryCode = component.short_name;
      }
    });

    if (place.geometry?.location) {
      lat = place.geometry.location.lat();
      lng = place.geometry.location.lng();
    }

    const formattedAddress = place.formatted_address ?? place.name ?? '';

    form.setValue('address', formattedAddress, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue('country', country || undefined, { shouldDirty: true }); // Set to undefined if empty
    form.setValue('countryCode', countryCode || undefined, {
      shouldDirty: true,
    });
    form.setValue('latitude', lat, { shouldDirty: true }); // null when no geometry
    form.setValue('longitude', lng, { shouldDirty: true });

    if (place.name && place.name !== formattedAddress.split(',')[0]) {
      if (!form.getValues('venue')) {
        form.setValue('venue', place.name, { shouldDirty: true });
      }
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

  // Updated onSubmit handler
  const onSubmit = (data: EventFormValues) => {
    startTransition(async () => {
      try {
        let result;
        if (isEditing && eventId) {
          result = await updateEvent(eventId, data);
        } else {
          result = await createEvent(data);
        }

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
    console.error('Form validation errors:', errors);
    const errorFields = Object.keys(errors).map((key) => {
      return {
        field: key,
        error: errors[key as keyof EventFormValues]?.message,
      };
    });

    // Display the first error message for a concise toast
    const errorMessage = `Form validation failed. Please check the fields: ${errorFields.map((field) => field.field).join(', ')}`;
    toast.error(errorMessage);
  };

  const currentImageUrlValue = form.watch('imageUrl');

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
                currentImageUrl={currentImageUrlValue}
                onUploadComplete={handleImageUploadComplete}
              />
            </CardContent>
          </Card>

          {isEditing && isDraft ? (
            <PublishRequirements
              eventData={{
                id: eventId || '',
                name: form.watch('eventName'),
                description: form.watch('description'),
                organizer: form.watch('organizer'),
                startDate: form.watch('startDate'),
                endDate: form.watch('endDate'),
                venue: form.watch('venue'),
                address: form.watch('address'),
                imageUrl: form.watch('imageUrl'),
                ticketTypes:
                  ticketTypes?.map((ticket) => ({
                    name: ticket.name,
                    price: ticket.price,
                    quantity: ticket.quantity,
                    maxPurchasePerUser: ticket.maxPurchasePerUser,
                    saleStartDate: ticket.saleStartDate,
                    saleEndDate: ticket.saleEndDate,
                  })) || [],
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
                  {/* Event Name */}

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

                  <FormField
                    control={form.control}
                    name="organizer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organizer</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Troptix Events"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <FormDescription>
                          Name of the person or organization organizing the
                          event.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Start Date */}
                    <div className="flex flex-col gap-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Start Date</FormLabel>
                            <div className="flex flex-row gap-2 items-center">
                              <FormControl>
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
                                <Input
                                  type="time"
                                  value={formatTime(field.value)}
                                  onChange={(e) => {
                                    const time = e.target.value;
                                    const combined = combineDateTime(
                                      field.value,
                                      time
                                    );
                                    field.onChange(combined);
                                  }}
                                  className="w-full sm:w-[120px]"
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* End Date */}
                    <div className="flex flex-col gap-4">
                      <FormField
                        control={form.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>End Date</FormLabel>
                            <div className="flex flex-row gap-2 items-center">
                              <FormControl>
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
                                <Input
                                  type="time"
                                  value={formatTime(field.value)}
                                  onChange={(e) => {
                                    const time = e.target.value;
                                    const combined = combineDateTime(
                                      field.value,
                                      time
                                    );
                                    field.onChange(combined);
                                  }}
                                  className="w-full sm:w-[120px]"
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
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

                  {/* Venue */}

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
                    onClick={handleOpenDrawerForNew}
                    disabled={isPending} // Disable add button while submitting main form
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
                                <TableCell>{field.quantity}</TableCell>
                                <TableCell className="text-right space-x-1">
                                  {/* Edit Button -> Opens drawer */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      handleOpenDrawerForEdit(index)
                                    }
                                    disabled={isPending} // Disable while submitting
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                  </Button>
                                  {/* Remove Button -> RHF remove */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => remove(index)}
                                    type="button"
                                    disabled={isPending} // Disable while submitting
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
                    {/* RHF Array Error Message */}
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
      </div>{' '}
      {!isEditing && (
        <AddTicketTypeDrawer
          paidEventsEnabled={paidEventsEnabled}
          open={isDrawerOpen}
          setOpen={setIsDrawerOpen}
          onSubmit={handleDrawerSubmit} // Parent function to update RHF state
          initialData={currentTicketData} // Pass data for editing/defaults for new
          ticketSchema={ticketTypeSchema} // Pass schema for validation within drawer
          eventStartDate={form.getValues('startDate')}
        />
      )}
    </div>
  );
}
