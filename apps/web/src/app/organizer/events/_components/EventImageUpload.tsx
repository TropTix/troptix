'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import {
  uploadEventFlyer,
  deleteEventFlyer,
  eventFlyerUrl,
} from '@/lib/supabase/storage';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  UploadCloud,
  X,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';

interface EventImageUploaderProps {
  currentImageUrl?: string | null;
  onUploadComplete: (path: string | null) => void;
}

export function EventImageUploader({
  currentImageUrl,
  onUploadComplete,
}: EventImageUploaderProps) {
  const inputId = useId();
  const resolvedCurrentUrl = eventFlyerUrl(currentImageUrl);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    resolvedCurrentUrl
  );
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewUrl(resolvedCurrentUrl);
    if (!isUploading) {
      setFile(null);
    }
  }, [resolvedCurrentUrl, isUploading]);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setPreviewUrl((prev) =>
          prev === objectUrl ? resolvedCurrentUrl : prev
        );
      }
    };
  }, [file, resolvedCurrentUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];

      if (!selectedFile.type.startsWith('image/')) {
        setError('Please select an image file (e.g., JPG, PNG).');
        setFile(null);
        setPreviewUrl(resolvedCurrentUrl);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit.');
        setFile(null);
        setPreviewUrl(resolvedCurrentUrl);
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('No file selected.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const path = await uploadEventFlyer(file);
      setPreviewUrl(eventFlyerUrl(path));
      onUploadComplete(path);
      setFile(null);
    } catch (uploadError: unknown) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Unknown error';
      console.error('Upload failed:', uploadError);
      setError(`Upload failed: ${message}`);
      setPreviewUrl(resolvedCurrentUrl);
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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <input
        id={inputId}
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="sr-only"
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
              asChild
              variant="outline"
              size="sm"
              className="mt-2 cursor-pointer"
            >
              <label htmlFor={inputId}>
                <UploadCloud className="mr-2 h-4 w-4" /> Select Image
              </label>
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
          asChild
          variant="outline"
          size="sm"
          className="w-full cursor-pointer"
        >
          <label htmlFor={inputId}>
            <UploadCloud className="mr-2 h-4 w-4" /> Change Image
          </label>
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
