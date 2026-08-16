import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { organizationLogoUrl } from '@/lib/supabase/storage';
import { initials } from '@/lib/utils';

export function OrgAvatar({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  const src = organizationLogoUrl(logoUrl);
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className="bg-muted font-semibold text-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
