'use client';

import React, { useState } from 'react';
import { Check, X, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  validateEventForPublish,
  type EventForValidation,
} from '@/lib/validations/publishValidation';

interface PublishRequirementsProps {
  eventData: Partial<EventForValidation>;
  className?: string;
}

export function PublishRequirements({
  eventData,
  className,
}: PublishRequirementsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Create a mock validation object with defaults for missing fields
  const validationData: EventForValidation = {
    id: eventData.id || '',
    name: eventData.name || null,
    description: eventData.description || null,
    organizer: eventData.organizer || null,
    startsAt: eventData.startsAt || null,
    endsAt: eventData.endsAt || null,
    venue: eventData.venue || null,
    address: eventData.address || null,
    imageUrl: eventData.imageUrl || null,
    ticketTypes: eventData.ticketTypes || [],
  };

  console.log('validationData', validationData);

  const validationResult = validateEventForPublish(validationData);

  const requirementCategories = [
    {
      title: 'Basic Information',
      items: [
        {
          label: 'Event Name (3+ characters)',
          field: 'name',
          completed: !!(eventData.name && eventData.name.length >= 3),
        },
        {
          label: 'Event Description',
          field: 'description',
          completed: !!(
            eventData.description && eventData.description.trim().length > 0
          ),
        },
        {
          label: 'Organizer Name',
          field: 'organizer',
          completed: !!(
            eventData.organizer && eventData.organizer.trim().length > 0
          ),
        },
        {
          label: 'Venue',
          field: 'venue',
          completed: !!(eventData.venue && eventData.venue.trim().length > 0),
        },
        {
          label: 'Address (5+ characters)',
          field: 'address',
          completed: !!(eventData.address && eventData.address.length >= 5),
        },
        {
          label: 'Event Image',
          field: 'imageUrl',
          completed: !!(
            eventData.imageUrl && eventData.imageUrl.trim().length > 0
          ),
        },
      ],
    },
    {
      title: 'Event Timing',
      items: [
        {
          label: 'Start Date',
          field: 'startsAt',
          completed: !!eventData.startsAt,
        },
        {
          label: 'End Date',
          field: 'endsAt',
          completed: !!eventData.endsAt,
        },
        {
          label: 'Valid Date Range',
          field: 'dateRange',
          completed: !!(
            eventData.startsAt &&
            eventData.endsAt &&
            eventData.endsAt > eventData.startsAt
          ),
        },
        {
          label: 'Future Event Date',
          field: 'futureDate',
          completed: !!(eventData.endsAt && eventData.endsAt > new Date()),
        },
      ],
    },
    {
      title: 'Ticketing',
      items: [
        {
          label: 'At Least One Ticket Type',
          field: 'ticketTypes',
          completed: !!(
            eventData.ticketTypes && eventData.ticketTypes.length > 0
          ),
        },
        {
          label: 'Valid Ticket Details',
          field: 'ticketValidation',
          completed: !!(
            eventData.ticketTypes &&
            eventData.ticketTypes.length > 0 &&
            eventData.ticketTypes.every(
              (ticket) =>
                ticket.name &&
                ticket.name.length >= 3 &&
                ticket.price >= 0 &&
                ticket.capacity > 0 &&
                ticket.maxPurchasePerUser > 0
            )
          ),
        },
      ],
    },
  ];

  const completedCount = requirementCategories.reduce(
    (total, category) =>
      total + category.items.filter((item) => item.completed).length,
    0
  );

  const totalCount = requirementCategories.reduce(
    (total, category) => total + category.items.length,
    0
  );

  const completionPercentage = Math.round((completedCount / totalCount) * 100);

  return (
    <Card className={cn('', className)}>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronRight
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-300 ease-in-out',
                isExpanded && 'rotate-90'
              )}
            />
            <CardTitle className="flex items-center gap-2">
              {validationResult.isValid ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              Publish Requirements
            </CardTitle>
          </div>
          <Badge variant={validationResult.isValid ? 'default' : 'secondary'}>
            {completedCount}/{totalCount}
          </Badge>
        </div>

        <CardDescription>
          {validationResult.isValid
            ? 'All requirements completed! Ready to publish.'
            : `Complete ${totalCount - completedCount} more requirement${totalCount - completedCount === 1 ? '' : 's'} to publish.`}
        </CardDescription>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
          <div
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              validationResult.isValid ? 'bg-green-500' : 'bg-primary'
            )}
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </CardHeader>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <CardContent className="space-y-4">
          {requirementCategories.map((category) => (
            <div key={category.title}>
              <h4 className="text-sm font-medium mb-2">{category.title}</h4>
              <div className="space-y-1">
                {category.items.map((item) => (
                  <div
                    key={item.field}
                    className="flex items-center gap-2 text-sm"
                  >
                    {item.completed ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <X className="h-4 w-4 text-gray-400" />
                    )}
                    <span
                      className={cn(
                        item.completed
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-gray-600 dark:text-gray-400'
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </div>
    </Card>
  );
}
