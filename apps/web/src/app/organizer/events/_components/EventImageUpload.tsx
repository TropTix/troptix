// components/EventImageUploader.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  uploadEventFlyer,
  deleteEventFlyer,
  eventFlyerUrl,
} from '@/lib/supabase/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  UploadCloud,
  X,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Image from 'next/image'; // Use Next.js Image for optimization

interface EventImageUploaderProps {
  // `currentImageUrl` carries the stored value, which is now a Supabase Storage
  // PATH (ADR 0016), not a URL. `onUploadComplete` likewise emits a path (or
  // null when cleared). Previews are resolved to URLs via eventFlyerUrl().
  currentImageUrl?: string | null;
  onUploadComplete: (path: string | null) => void;
}

export function EventImageUploader({
  currentImageUrl,
  onUploadComplete,
}: EventImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    eventFlyerUrl(currentImageUrl)
  );
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewUrl(eventFlyerUrl(currentImageUrl));
    if (!isUploading) {
      setFile(null);
    }
  }, [currentImageUrl, isUploading]);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }

    // Cleanup function
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setPreviewUrl((prev) =>
          prev === objectUrl ? eventFlyerUrl(currentImageUrl) : prev
        );
      }
    };
  }, [file, currentImageUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];

      if (!selectedFile.type.startsWith('image/')) {
        setError('Please select an image file (e.g., JPG, PNG).');
        setFile(null);
        setPreviewUrl(eventFlyerUrl(currentImageUrl));
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit.');
        setFile(null);
        setPreviewUrl(eventFlyerUrl(currentImageUrl));
        return;
      }

      setFile(selectedFile);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!file) {
      setError('No file selected.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Returns the stored bucket path (what goes into Events.imageUrl).
      const path = await uploadEventFlyer(file);
      setPreviewUrl(eventFlyerUrl(path));
      onUploadComplete(path);
      setFile(null);
    } catch (uploadError: unknown) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Unknown error';
      console.error('Upload failed:', uploadError);
      setError(`Upload failed: ${message}`);
      setPreviewUrl(eventFlyerUrl(currentImageUrl));
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (file) {
      handleUpload();
    }
  }, [file]);

  const handleRemoveImage = async () => {
    setError(null);
    setFile(null);
    setPreviewUrl(null);
    setIsUploading(false);
    const previous = currentImageUrl;
    onUploadComplete(null);

    if (previous) {
      try {
        await deleteEventFlyer(previous);
        console.log('Existing image deleted from Supabase Storage.');
      } catch (deleteError: unknown) {
        console.error('Failed to delete existing image:', deleteError);
        setError(
          'Could not remove existing image from storage, but cleared from form.'
        );
      }
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
        disabled={isUploading}
      />

      <div className="w-full aspect-video border-2 border-dashed rounded-md flex items-center justify-center relative overflow-hidden bg-muted/30">
        {previewUrl ? (
          <>
            <Image
              src={previewUrl}
              alt="Event flyer preview"
              fill
              style={{ objectFit: 'contain' }}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            {!isUploading && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 z-10 h-7 w-7"
                onClick={handleRemoveImage}
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <div className="text-center p-4 text-muted-foreground">
            <ImageIcon className="mx-auto h-12 w-12 mb-2" />
            <p className="text-sm">No image selected</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={triggerFileInput}
              disabled={isUploading}
            >
              <UploadCloud className="mr-2 h-4 w-4" /> Select Image
            </Button>
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-20">
            <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
            <p className="text-white text-sm">Uploading…</p>
          </div>
        )}
      </div>

      {previewUrl && !isUploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={triggerFileInput}
          className="w-full"
        >
          <UploadCloud className="mr-2 h-4 w-4" /> Change Image
        </Button>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Upload Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
