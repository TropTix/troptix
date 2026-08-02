import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function PaidWarningBannerForm() {
  return (
    <Alert variant="info">
      <AlertTitle>Want to create paid events?</AlertTitle>
      <AlertDescription>
        Schedule a meeting with our team to get organizer verification and
        unlock paid ticketing features.
      </AlertDescription>
      <div className="col-start-2 flex gap-2 mt-2">
        <Button variant="outline" size="sm" asChild>
          <Link
            href="mailto:info@usetroptix.com?subject=Organizer Verification Request"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact Support
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link
            href="https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2WEgtuwexAzT6QOpQIiwK2PhMfJcPzu8E8T2zbXUAeU79qA_9KJiWbSIb9ddCgFD78gLrx9F0R"
            target="_blank"
            rel="noopener noreferrer"
          >
            Schedule Meeting
          </Link>
        </Button>
      </div>
    </Alert>
  );
}

export function PaidWarningBannerOrganizer() {
  return (
    <Alert variant="info">
      <AlertTitle>Schedule a Meeting to Unlock Paid Events</AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <p>
            You can create unlimited free events right now. To create paid
            events, you&apos;ll need to schedule a meeting with our team.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                href="mailto:info@usetroptix.com?subject=Organizer Verification Request"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contact Support
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href="https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2WEgtuwexAzT6QOpQIiwK2PhMfJcPzu8E8T2zbXUAeU79qA_9KJiWbSIb9ddCgFD78gLrx9F0R"
                target="_blank"
                rel="noopener noreferrer"
              >
                Schedule Meeting
              </Link>
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
