import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as React from 'react';
import { cn } from '../libs/utils.ts';

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square h-full w-full', className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  );
}

/**
 * CrossfadeAvatar - Avatar with smooth crossfade from fallback to image
 *
 * Shows the fallback initially, then crossfades to the image when loaded.
 * Both elements are layered so the transition is smooth.
 */
interface CrossfadeAvatarProps {
  src?: string | null;
  alt?: string;
  fallback: React.ReactNode;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
}

function CrossfadeAvatar({
  src,
  alt,
  fallback,
  className,
  fallbackClassName,
  imageClassName,
}: Readonly<CrossfadeAvatarProps>) {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [currentSrc, setCurrentSrc] = React.useState(src);

  // Detect if the image is an SVG
  const isSvg = React.useMemo(() => src?.endsWith('.svg') ?? false, [src]);

  // Reset loaded state when src changes (but check if new image is already cached first)
  React.useEffect(() => {
    if (src !== currentSrc) {
      // Check if new image is already in browser cache
      if (src) {
        const img = new Image();
        img.src = src;
        if (img.complete && img.naturalWidth > 0) {
          // Image is already cached, no need to show fallback
          setCurrentSrc(src);
          setIsLoaded(true);
          return;
        }
      }
      setIsLoaded(false);
      setCurrentSrc(src);
    }
  }, [src, currentSrc]);

  const imgCallbackRef = React.useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node?.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, []);

  return (
    <div className={cn('relative flex shrink-0 overflow-hidden', className)}>
      {/* Fallback - always rendered, fades out when image loads */}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity duration-200',
          isLoaded ? 'opacity-0' : 'opacity-100',
          fallbackClassName,
        )}
      >
        {fallback}
      </div>

      {/* Image - fades in when loaded */}
      {src &&
        (isSvg ? (
          // SVG as background image for better control
          <div
            className={cn(
              'w-full h-full transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0',
              imageClassName,
            )}
            style={{
              backgroundImage: `url("${src}")`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            role="img"
            aria-label={alt}
          >
            {/* Hidden img for load detection and caching */}
            <img
              ref={imgCallbackRef}
              src={src}
              alt=""
              onLoad={() => setIsLoaded(true)}
              style={{ display: 'none' }}
            />
          </div>
        ) : (
          // Regular image
          <img
            ref={imgCallbackRef}
            src={src}
            alt={alt}
            onLoad={() => setIsLoaded(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0',
              imageClassName,
            )}
          />
        ))}

      {/* Show fallback statically if no src */}
      {!src && (
        <div className={cn('flex h-full w-full items-center justify-center', fallbackClassName)}>
          {fallback}
        </div>
      )}
    </div>
  );
}

export { Avatar, AvatarFallback, AvatarImage, CrossfadeAvatar };
