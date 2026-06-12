'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Calendar,
  Home,
  LogOut,
  PlusCircle,
  Shield,
  Ticket,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { signOut as supabaseSignOut } from '@/lib/supabaseAuth';
import { TropTixContext } from '../AuthProvider';

// Helper to check if the user is a platform owner
// This is also checked on the backed
const isPlatformOwner = (email?: string | null): boolean => {
  if (!email) return false;
  return email.endsWith('@usetroptix.com');
};

// Helper to generate user initials for the avatar
// Accepts user object with firstName, lastName, email
const getUserInitials = (user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string => {
  if (user?.firstName && user?.lastName) {
    return (
      user.firstName.charAt(0).toUpperCase() +
      user.lastName.charAt(0).toUpperCase()
    );
  }
  if (user?.email) {
    return user.email.charAt(0).toUpperCase();
  }
  return 'A';
};

export default function UnifiedHeader() {
  const [hasScrolled, setHasScrolled] = useState<boolean>(false);
  const { user } = useContext(TropTixContext);
  const pathname = usePathname();

  // Effect to handle scroll-based styling
  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check on mount
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Don't render the header on authentication pages
  if (pathname?.startsWith('/auth')) {
    return null;
  }

  const isOrganizerRoute = pathname?.startsWith('/organizer');
  const userIsPlatformOwner = isPlatformOwner(user?.email);

  // Organizer-specific navigation, shown contextually
  const organizerNavItems = [
    { label: 'Dashboard', href: '/organizer', icon: Home },
    { label: 'My Events', href: '/organizer/events', icon: Calendar },
  ];

  if (userIsPlatformOwner) {
    organizerNavItems.push({
      label: 'Platform Events',
      href: '/organizer/platform/events',
      icon: Shield,
    });
  }

  const handleSignOut = async () => {
    await supabaseSignOut();
  };

  const UserMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">My Account</p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isOrganizerRoute && (
          <DropdownMenuItem asChild>
            <Link href="/orders">
              <Ticket className="mr-2 h-4 w-4" />
              Tickets
            </Link>
          </DropdownMenuItem>
        )}
        {!isOrganizerRoute && (
          <DropdownMenuItem asChild>
            <Link href="/organizer">
              <Home className="mr-2 h-4 w-4" />
              Organizer Dashboard
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link href="/organizer/events/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Event
          </Link>
        </DropdownMenuItem>

        {isOrganizerRoute && (
          <DropdownMenuItem asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header
      className={cn(
        'fixed w-full z-30 transition-all duration-300 ease-in-out border-b',
        // Frosted glass nav — heavier blur, softer fill. Reads as part of the dark
        // hero at the top of the page; settles into a clean translucent bar on scroll.
        hasScrolled
          ? 'bg-background/85 backdrop-blur-md backdrop-saturate-150'
          : 'bg-background/55 backdrop-blur-md backdrop-saturate-150',
        hasScrolled && !isOrganizerRoute ? 'shadow-lg' : '',
        isOrganizerRoute
          ? 'border-primary/20'
          : hasScrolled
            ? 'border-border'
            : 'border-transparent'
      )}
    >
      <div className="container flex items-center justify-between h-16">
        <Link
          href={isOrganizerRoute && user?.isOrganizer ? '/organizer' : '/'}
          className="flex flex-col items-center text-2xl font-bold text-primary leading-none"
        >
          <span className="block text-center">TropTix</span>
          {isOrganizerRoute && (
            <span className="text-xs text-muted-foreground leading-tight text-center">
              Organizer
            </span>
          )}
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {isOrganizerRoute ? (
              organizerNavItems.map((item) => (
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className="p-2 md:px-3 md:py-1.5"
                  asChild
                  key={item.href}
                >
                  <Link href={item.href}>
                    <item.icon className="h-5 w-5 md:h-4 md:w-4" />
                    <span className="hidden md:inline ml-2 text-sm font-medium">
                      {item.label}
                    </span>
                  </Link>
                </Button>
              ))
            ) : (
              <>
                <Button variant="ghost" className="p-2 " asChild>
                  <Link href="/events">
                    <Calendar className="h-5 w-5" />
                    <span className="hidden md:inline ml-2">
                      Explore Events
                    </span>
                  </Link>
                </Button>
                {user && (
                  <Button variant="ghost" className="p-2 " asChild>
                    <Link href="/orders">
                      <Ticket className="h-5 w-5" />
                      <span className="hidden md:inline ml-2">Tickets</span>
                    </Link>
                  </Button>
                )}
              </>
            )}
          </nav>

          {user?.id ? (
            <UserMenu />
          ) : (
            <>
              <Button variant="default" className="rounded-full" asChild>
                <Link href="/auth/signin">
                  <span className=" ml-0 w-full">Sign In</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
