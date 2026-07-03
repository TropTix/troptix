'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  uploadOrganizationLogo,
  organizationLogoUrl,
} from '@/lib/supabase/storage';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/utils';

const MAX_BYTES = 5 * 1024 * 1024;

// Uploads to the organization-logos bucket and reports back the stored PATH.
// Preview shows the local file while uploading, then the resolved logo; falls
// back to a monogram when there's none.
export function OrganizationLogoUpload({
  value,
  name,
  onChange,
}: {
  value: string | null;
  name: string;
  onChange: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const preview = localPreview ?? organizationLogoUrl(value);

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }

    const obj = URL.createObjectURL(file);
    setLocalPreview(obj);
    setUploading(true);
    try {
      const path = await uploadOrganizationLogo(file);
      onChange(path);
    } catch {
      setError('Upload failed. Try again.');
      setLocalPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(obj);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-border bg-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Organization logo"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xl font-semibold text-foreground">
            {initials(name || 'Organizer')}
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="gap-1.5"
          >
            <ImagePlus className="h-4 w-4" /> {value ? 'Change' : 'Upload logo'}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => {
                setLocalPreview(null);
                setError(null);
                onChange(null);
              }}
              className="gap-1.5 text-muted-foreground"
            >
              <X className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, or WebP · up to 5 MB
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onSelect}
      />
    </div>
  );
}
