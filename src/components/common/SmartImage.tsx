import { useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { mediaUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';

/**
 * Image from the media bucket (or absolute URL) with lazy loading, a fade-in
 * on load and a neutral fallback when missing or broken (no broken-image icons).
 */
export function SmartImage({
  path,
  alt,
  className,
  imgClassName,
  priority = false,
  ...rest
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'className'>) {
  const src = mediaUrl(path);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn('relative overflow-hidden bg-bg-2', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-cover transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
          {...rest}
        />
      ) : (
        <div className="grid-lines flex size-full items-center justify-center" role="img" aria-label={alt}>
          <ImageOff className="size-6 text-subtle" aria-hidden />
        </div>
      )}
    </div>
  );
}
