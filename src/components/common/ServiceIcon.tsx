import {
  CalendarCheck,
  Code,
  Gauge,
  Globe,
  Layers,
  LayoutTemplate,
  PenTool,
  RefreshCw,
  Search,
  ShoppingBag,
  Smartphone,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/** Icons selectable for services in the admin. Key is stored in services.icon. */
export const SERVICE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  'pen-tool': { icon: PenTool, label: 'Design' },
  code: { icon: Code, label: 'Code' },
  'refresh-cw': { icon: RefreshCw, label: 'Redesign' },
  smartphone: { icon: Smartphone, label: 'Mobile' },
  'calendar-check': { icon: CalendarCheck, label: 'Booking' },
  layers: { icon: Layers, label: 'Application' },
  wrench: { icon: Wrench, label: 'Maintenance' },
  layout: { icon: LayoutTemplate, label: 'Layout' },
  'shopping-bag': { icon: ShoppingBag, label: 'E-commerce' },
  search: { icon: Search, label: 'SEO' },
  gauge: { icon: Gauge, label: 'Performance' },
  globe: { icon: Globe, label: 'Web' },
};

export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = SERVICE_ICONS[name]?.icon ?? LayoutTemplate;
  return <Icon className={className} aria-hidden />;
}
