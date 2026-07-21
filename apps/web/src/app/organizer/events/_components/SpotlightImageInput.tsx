'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  uploadSpotlightImage,
  spotlightImageUrl,
} from '@/lib/supabase/storage';
import { Button } from '@/components/ui/button';

const MAX_BYTES = 5 * 1024 * 1024;
// Match the spotlight-images bucket allowlist so rejects surface client-side
// with a clear message instead of a generic server error.
const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

// Uploads to the spotlight-images bucket and reports back the stored PATH.
// Preview shows the local file while uploading, then the resolved image.
export function SpotlightImageInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const preview = localPreview ?? spotlightImageUrl(value);

  // Revoke a blob preview only when it's replaced or the component unmounts.
  useEffect(() => {
    if (!localPreview?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use a PNG, JPG, WebP, or AVIF image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }

    setLocalPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const path = await uploadSpotlightImage(file);
      onChange(path);
    } catch {
      setError('Upload failed. Try again.');
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Spotlight image"
            className="h-full w-full object-cover"
          />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
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
            <ImagePlus className="h-4 w-4" /> {value ? 'Change' : 'Upload'}
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
          Optional · PNG, JPG, or WebP · up to 5 MB
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onSelect}
      />
    </div>
  );
}
