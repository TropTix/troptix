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
  Menu,
  PlusCircle,
  Shield,
  Ticket,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { signOut as supabaseSignOut } from '@/lib/supabaseAuth';
import { TropTixContext } from '../AuthProvider';

type NavLinkItem = { label: string; href: string; icon: LucideIcon };

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

  // Scroll-based styling, throttled to one state update per frame.
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setHasScrolled(window.scrollY > 10);
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check on mount
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Don't render the header on authentication pages
  if (pathname?.startsWith('/auth')) {
    return null;
  }

  const isOrganizerRoute = pathname?.startsWith('/organizer');
  const userIsPlatformOwner = isPlatformOwner(user?.email);

  // Active when the path matches exactly or sits under the link (e.g. an event
  // detail page under /events). The home link only lights up on an exact match.
  const isActive = (href: string): boolean => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Organizer-specific navigation, shown contextually
  const organizerNavItems: NavLinkItem[] = [
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

  const patronNavItems: NavLinkItem[] = [
    { label: 'Explore Events', href: '/events', icon: Calendar },
    ...(user?.id
      ? [{ label: 'Tickets', href: '/orders', icon: Ticket } as NavLinkItem]
      : []),
  ];

  const navItems = isOrganizerRoute ? organizerNavItems : patronNavItems;

  const handleSignOut = async () => {
    await supabaseSignOut();
  };

  // Inline links for the desktop bar — active route gets an underline + brand color.
  const NavLink = ({ label, href, icon: Icon }: NavLinkItem) => (
    <Link
      href={href}
      aria-current={isActive(href) ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 border-b-2 py-1 text-sm font-medium transition-colors',
        isActive(href)
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-primary'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );

  // Mobile nav lives in a labelled menu so icon-only triggers stay accessible.
  const MobileMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {navItems.map((item) => (
          <DropdownMenuItem asChild key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        {!isOrganizerRoute && (
          <DropdownMenuItem asChild>
            <Link href="/organizer/events/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Event
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Account menu — identity + account-level shortcuts. Navigation lives in the
  // bar (desktop) and the mobile menu, so it's intentionally not duplicated here.
  const UserMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-10 rounded-full"
          aria-label="Open account menu"
        >
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
        {isOrganizerRoute ? (
          <DropdownMenuItem asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/organizer">
              <Home className="mr-2 h-4 w-4" />
              Organizer Dashboard
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
          className="flex flex-col text-2xl font-bold text-primary leading-none"
        >
          <span>TropTix</span>
          {isOrganizerRoute && (
            <span className="text-xs text-muted-foreground leading-tight">
              Organizer
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="hidden md:flex items-center gap-5">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>

          {!isOrganizerRoute && (
            <Button
              variant="outline"
              className="hidden md:inline-flex border-primary/30 text-primary hover:bg-primary/5"
              asChild
            >
              <Link href="/organizer/events/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Event
              </Link>
            </Button>
          )}

          {user?.id ? (
            <UserMenu />
          ) : (
            <Button variant="default" className="rounded-full" asChild>
              <Link href="/auth/signin">Sign In</Link>
            </Button>
          )}

          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
