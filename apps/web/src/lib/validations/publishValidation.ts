interface PublishValidationError {
  field: string;
  message: string;
  category: 'basic' | 'tickets' | 'timing';
}

interface PublishValidationResult {
  isValid: boolean;
  errors: PublishValidationError[];
  missingRequirements: string[];
}

export interface EventForValidation {
  id: string;
  name: string | null;
  description: string | null;
  organizer: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  venue: string | null;
  address: string | null;
  imageUrl: string | null;
  ticketTypes: Array<{
    name: string;
    price: number;
    quantity: number;
    maxPurchasePerUser: number;
    saleStartsAt: Date;
    saleEndsAt: Date;
  }>;
}

export function validateEventForPublish(
  event: EventForValidation,
  paidEventsEnabled?: boolean
): PublishValidationResult {
  const errors: PublishValidationError[] = [];
  const missingRequirements: string[] = [];

  // Basic Event Information Validation
  if (!event.name || event.name.trim().length < 3) {
    errors.push({
      field: 'name',
      message: 'Event name must be at least 3 characters long',
      category: 'basic',
    });
    missingRequirements.push('Event name (minimum 3 characters)');
  }

  if (!event.description || event.description.trim().length === 0) {
    errors.push({
      field: 'description',
      message: 'Event description is required',
      category: 'basic',
    });
    missingRequirements.push('Event description');
  }

  if (!event.organizer || event.organizer.trim().length === 0) {
    errors.push({
      field: 'organizer',
      message: 'Organizer name is required',
      category: 'basic',
    });
    missingRequirements.push('Organizer name');
  }

  if (!event.venue || event.venue.trim().length === 0) {
    errors.push({
      field: 'venue',
      message: 'Venue is required',
      category: 'basic',
    });
    missingRequirements.push('Venue');
  }

  if (!event.address || event.address.trim().length < 5) {
    errors.push({
      field: 'address',
      message: 'Address must be at least 5 characters long',
      category: 'basic',
    });
    missingRequirements.push('Complete address (minimum 5 characters)');
  }

  if (!event.imageUrl || event.imageUrl.trim().length === 0) {
    errors.push({
      field: 'imageUrl',
      message: 'Event image is required',
      category: 'basic',
    });
    missingRequirements.push('Event image');
  }

  // Date and Timing Validation
  if (!event.startsAt) {
    errors.push({
      field: 'startsAt',
      message: 'Event start date is required',
      category: 'timing',
    });
    missingRequirements.push('Event start date');
  }

  if (!event.endsAt) {
    errors.push({
      field: 'endsAt',
      message: 'Event end date is required',
      category: 'timing',
    });
    missingRequirements.push('Event end date');
  }

  if (event.startsAt && event.endsAt) {
    if (event.endsAt <= event.startsAt) {
      errors.push({
        field: 'endsAt',
        message: 'Event end date must be after start date',
        category: 'timing',
      });
      missingRequirements.push('Valid end date (must be after start date)');
    }

    // Check if event is in the past
    const now = new Date();
    if (event.endsAt <= now) {
      errors.push({
        field: 'endsAt',
        message: 'Event end date must be in the future',
        category: 'timing',
      });
      missingRequirements.push('Future end date');
    }
  }

  // Ticket Types Validation
  if (!event.ticketTypes || event.ticketTypes.length === 0) {
    errors.push({
      field: 'ticketTypes',
      message: 'At least one ticket type is required',
      category: 'tickets',
    });
    missingRequirements.push('At least one ticket type');
  } else {
    // Validate each ticket type
    event.ticketTypes.forEach((ticket, index) => {
      if (!ticket.name || ticket.name.trim().length < 3) {
        errors.push({
          field: `ticketTypes[${index}].name`,
          message: `Ticket "${ticket.name || 'Unnamed'}" must have a name with at least 3 characters`,
          category: 'tickets',
        });
        missingRequirements.push(`Valid name for ticket type ${index + 1}`);
      }

      if (ticket.price < 0) {
        errors.push({
          field: `ticketTypes[${index}].price`,
          message: `Ticket "${ticket.name || 'Unnamed'}" must have a valid price (≥ $0.00)`,
          category: 'tickets',
        });
        missingRequirements.push(
          `Valid price for "${ticket.name || `ticket ${index + 1}`}"`
        );
      }

      if (!paidEventsEnabled && ticket.price > 0) {
        errors.push({
          field: `ticketTypes[${index}].price`,
          message: `Ticket "${ticket.name || 'Unnamed'}" is paid but paid events are not enabled. Please contact support to enable paid events.`,
          category: 'tickets',
        });
        missingRequirements.push(
          `Valid price for "${ticket.name || `ticket ${index + 1}`}"`
        );
      }

      if (ticket.quantity <= 0) {
        errors.push({
          field: `ticketTypes[${index}].quantity`,
          message: `Ticket "${ticket.name || 'Unnamed'}" must have a positive quantity`,
          category: 'tickets',
        });
        missingRequirements.push(
          `Valid quantity for "${ticket.name || `ticket ${index + 1}`}"`
        );
      }

      if (ticket.maxPurchasePerUser <= 0) {
        errors.push({
          field: `ticketTypes[${index}].maxPurchasePerUser`,
          message: `Ticket "${ticket.name || 'Unnamed'}" must have a positive maximum purchase limit`,
          category: 'tickets',
        });
        missingRequirements.push(
          `Valid purchase limit for "${ticket.name || `ticket ${index + 1}`}"`
        );
      }

      // Validate ticket sale dates
      if (ticket.saleEndsAt <= ticket.saleStartsAt) {
        errors.push({
          field: `ticketTypes[${index}].saleEndsAt`,
          message: `Ticket "${ticket.name || 'Unnamed'}" sale end date must be after sale start date`,
          category: 'tickets',
        });
        missingRequirements.push(
          `Valid sale dates for "${ticket.name || `ticket ${index + 1}`}"`
        );
      }

      // Check if ticket sales end before or at event start
      if (event.endsAt && ticket.saleEndsAt > event.endsAt) {
        errors.push({
          field: `ticketTypes[${index}].saleEndsAt`,
          message: `Ticket "${ticket.name || 'Unnamed'}" sales should end before or at event end `,
          category: 'tickets',
        });
        missingRequirements.push(
          `Proper sale timing for "${ticket.name || `ticket ${index + 1}`}"`
        );
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingRequirements: Array.from(new Set(missingRequirements)), // Remove duplicates
  };
}

export function getPublishRequirementsSummary(
  validationResult: PublishValidationResult
): string {
  if (validationResult.isValid) {
    return 'All requirements met. Ready to publish!';
  }

  const categorizedErrors = {
    basic: validationResult.errors.filter((e) => e.category === 'basic'),
    timing: validationResult.errors.filter((e) => e.category === 'timing'),
    tickets: validationResult.errors.filter((e) => e.category === 'tickets'),
  };

  const categories: string[] = [];
  if (categorizedErrors.basic.length > 0)
    categories.push(`${categorizedErrors.basic.length} basic info`);
  if (categorizedErrors.timing.length > 0)
    categories.push(`${categorizedErrors.timing.length} timing`);
  if (categorizedErrors.tickets.length > 0)
    categories.push(`${categorizedErrors.tickets.length} ticket`);

  return `${validationResult.errors.length} requirement${validationResult.errors.length === 1 ? '' : 's'} missing (${categories.join(', ')})`;
}
