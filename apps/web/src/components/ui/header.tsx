'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { signOut as supabaseSignOut } from '@/lib/supabaseAuth';
import { TropTixContext } from '../AuthProvider';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  requiresAuth?: boolean;
}

export const navItems: NavItem[] = [
  {
    key: 'events',
    label: 'Explore Events',
    href: '/events',
  },
  {
    key: 'tickets',
    label: 'Tickets',
    href: '/orders',
    requiresAuth: true,
  },
];

export const authItems: NavItem[] = [
  {
    key: 'signin',
    label: 'Sign in',
    href: '/auth/signin',
  },
  {
    key: 'signup',
    label: 'Sign up',
    href: '/auth/signup',
  },
];

export default function Header() {
  const [top, setTop] = useState<boolean>(true);
  const { user } = useContext(TropTixContext);
  const pathname = usePathname();

  const scrollHandler = () => {
    window.scrollY > 10 ? setTop(false) : setTop(true);
  };

  useEffect(() => {
    scrollHandler();
    window.addEventListener('scroll', scrollHandler);
    return () => window.removeEventListener('scroll', scrollHandler);
  }, [top]);

  async function signOut() {
    await supabaseSignOut();
  }

  const getVisibleNavItems = () => {
    return navItems.filter((item) => {
      // Don't show tickets in nav if user is logged in (it will be in action buttons)
      if (item.key === 'tickets' && user.id) return false;
      return !item.requiresAuth || user.id;
    });
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user.email) return 'U';
    const email = user.email;
    const parts = email.split('@')[0].split('.');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email[0].toUpperCase();
  };

  return (
    <header
      className={`fixed w-full z-30 transition duration-300 ease-in-out border-b bg-white/80 backdrop-blur-sm ${
        !top ? 'shadow-lg' : ''
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-primary">
            TropTix
          </Link>

          {/* Right side - Navigation + Buttons */}
          <div className="flex items-center gap-6">
            {/* Navigation Items */}
            <nav className="flex items-center gap-4 sm:gap-6">
              {getVisibleNavItems().map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === item.href
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              {!user.id ? (
                // Unauthenticated state
                <>
                  {authItems.map((item) => (
                    <Button
                      key={item.key}
                      variant={item.key === 'signup' ? 'default' : 'ghost'}
                      size="sm"
                      asChild
                    >
                      <Link href={item.href}>{item.label}</Link>
                    </Button>
                  ))}
                </>
              ) : (
                // Authenticated state with avatar dropdown
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-2 h-10 px-2"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-sm font-medium">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {user.isOrganizer && (
                      <DropdownMenuItem asChild>
                        <Link href="/organizer">Dashboard</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/orders">Tickets</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={signOut}>
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
