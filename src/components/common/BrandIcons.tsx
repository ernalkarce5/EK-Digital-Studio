import type { SVGProps } from 'react';
import type { SocialKey } from '@/lib/constants';

// Simple brand glyphs (lucide-react v1 no longer ships brand icons).
type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  'aria-hidden': true,
  ...props,
});

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function LinkedinIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4V21H3V9.75Zm6.5 0h3.83v1.54h.06c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.13V21h-4v-5.02c0-1.2-.02-2.74-1.67-2.74-1.67 0-1.93 1.3-1.93 2.65V21h-4V9.75Z" />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.72H5.58l11.1 14.48Z" />
    </svg>
  );
}

export function BehanceIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor">
      <path d="M8.2 11.4c.9-.4 1.4-1.2 1.4-2.2C9.6 7 8 6 5.9 6H1v12h5.1c2.2 0 4.1-1.1 4.1-3.5 0-1.5-.8-2.7-2-3.1ZM3.3 8h2.2c.8 0 1.6.2 1.6 1.2 0 .9-.6 1.3-1.5 1.3H3.3V8Zm2.4 8H3.3v-3.4h2.5c1 0 1.7.4 1.7 1.6 0 1.3-.8 1.8-1.8 1.8ZM16.9 8.8c-2.6 0-4.4 2-4.4 4.6 0 2.7 1.7 4.6 4.4 4.6 2 0 3.4-.9 4.1-2.9h-2.1c-.2.7-1.1 1.1-1.9 1.1-1.4 0-2.1-.8-2.1-2.2H21c.2-2.8-1.4-5.2-4.1-5.2Zm-2 3.7c.1-1.1.8-1.9 2-1.9 1.1 0 1.7.7 1.8 1.9h-3.8ZM15 6.6h4v1.1h-4V6.6Z" />
    </svg>
  );
}

export function DribbbleIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.6 3.7c3.3 4.3 5.6 9.3 6.8 16.4M3.1 10.4c5.6.2 10.5-.6 15-3.9M5.3 18.3c3.4-4.3 8.6-5.9 15.5-4.4" />
    </svg>
  );
}

export function WhatsappIcon(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.17-1.5A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.07.9.92-2.98-.2-.31a8.2 8.2 0 1 1 6.83 3.72Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.71-1.33.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.47a.9.9 0 0 0-.66.31c-.23.25-.86.84-.86 2.06s.88 2.39 1 2.55c.13.17 1.74 2.65 4.21 3.72 1.56.67 2.17.73 2.95.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  );
}

export const SOCIAL_ICONS: Record<SocialKey, (p: IconProps) => React.JSX.Element> = {
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  github: GithubIcon,
  x: XIcon,
  behance: BehanceIcon,
  dribbble: DribbbleIcon,
};
