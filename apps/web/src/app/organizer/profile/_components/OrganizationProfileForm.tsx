'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  Twitter,
} from 'lucide-react';

import {
  organizationProfileSchema,
  OrganizationProfileValues,
} from '@/lib/schemas/organizationProfileSchema';
import { saveOrganizationProfile } from '../_actions/organizationActions';
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
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';

const PROFILE_URL_BASE = 'troptix.com/o/';

const SOCIAL_FIELDS: {
  name: 'instagram' | 'twitter' | 'linkedin' | 'website';
  label: string;
  icon: typeof Globe;
  placeholder: string;
}[] = [
  {
    name: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    placeholder: 'Instagram username',
  },
  {
    name: 'twitter',
    label: 'Twitter',
    icon: Twitter,
    placeholder: 'Twitter username',
  },
  {
    name: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    placeholder: 'LinkedIn URL',
  },
  {
    name: 'website',
    label: 'Website',
    icon: Globe,
    placeholder: 'Website URL',
  },
];

export default function OrganizationProfileForm({
  initial,
}: {
  initial: OrganizationProfileValues;
}) {
  const [isPending, startTransition] = useTransition();
  // The public page lives at the *saved* slug — link there, not at an unsaved edit.
  const [savedSlug, setSavedSlug] = useState(initial.slug);

  const form = useForm<OrganizationProfileValues>({
    resolver: zodResolver(organizationProfileSchema),
    defaultValues: initial,
  });

  const displayName = form.watch('displayName');
  const slug = form.watch('slug');

  const onSubmit = (data: OrganizationProfileValues) => {
    startTransition(async () => {
      try {
        const result = await saveOrganizationProfile(data);
        if (result.success) {
          toast.success('Profile saved.');
          if (result.slug) {
            setSavedSlug(result.slug);
            form.reset(data);
          }
        } else {
          toast.error(result.error ?? 'Could not save your profile.');
        }
      } catch {
        toast.error('An unexpected error occurred.');
      }
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Organizer
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">Profile Info</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Powers “Hosted by” on your events and your public organizer page.
        </p>
      </div>

      <div className="mb-8 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Avatar className="h-20 w-20 rounded-2xl text-xl">
          <AvatarFallback className="rounded-2xl bg-muted font-semibold text-foreground">
            {initials(displayName || 'Organizer')}
          </AvatarFallback>
        </Avatar>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={`/o/${savedSlug}`} target="_blank" rel="noopener noreferrer">
            View profile <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand name</FormLabel>
                <FormControl>
                  <Input placeholder="Island Vibes Collective" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Biography</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="What you're about, where you throw events…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {SOCIAL_FIELDS.map(({ name, label, icon: Icon, placeholder }) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={placeholder}
                        className="pl-9"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profile URL</FormLabel>
                <FormControl>
                  <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
                    <span className="pl-3 text-sm text-muted-foreground">
                      {PROFILE_URL_BASE}
                    </span>
                    <Input
                      className="border-0 pl-1 focus-visible:ring-0"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormDescription>
                  {slug !== initial.slug
                    ? 'Changing this breaks existing links to your old URL.'
                    : 'Your public organizer page address.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
