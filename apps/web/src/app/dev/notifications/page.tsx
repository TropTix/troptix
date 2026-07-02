import { notFound } from 'next/navigation';
import NotificationCatalog from './_components/NotificationCatalog';

export default function NotificationsDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <NotificationCatalog />;
}
