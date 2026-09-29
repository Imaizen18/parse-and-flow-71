import {
  Utensils,
  Car,
  ShoppingCart,
  Home,
  Pill,
  Film,
  Shirt,
  Smartphone,
  Plane,
  GraduationCap,
  Briefcase,
  PiggyBank,
  PawPrint,
  Gift,
  Coffee,
  Heart,
  Music,
  Tv,
  Wifi,
  Zap,
  TrendingUp,
  Tag,
  Handshake,
  Clock,
  ArrowLeftRight,
} from "lucide-react";

export const CATEGORY_ICONS = {
  Utensils,
  Car,
  ShoppingCart,
  Home,
  Pill,
  Film,
  Shirt,
  Smartphone,
  Plane,
  GraduationCap,
  Briefcase,
  PiggyBank,
  PawPrint,
  Gift,
  Coffee,
  Heart,
  Music,
  Tv,
  Wifi,
  Zap,
  TrendingUp,
  Tag,
  Handshake,
  Clock,
  ArrowLeftRight,
};

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

const EMOJI_TO_LUCIDE: Record<string, CategoryIconName> = {
  "🍔": "Utensils",
  "🚗": "Car",
  "🛒": "ShoppingCart",
  "🏠": "Home",
  "💊": "Pill",
  "🎬": "Film",
  "👗": "Shirt",
  "📱": "Smartphone",
  "✈️": "Plane",
  "🎓": "GraduationCap",
  "💼": "Briefcase",
  "💰": "PiggyBank",
  "🐾": "PawPrint",
  "🎁": "Gift",
};

export function CategoryIcon({ icon, className = "size-4" }: { icon: string; className?: string }) {
  // Check if it's an emoji (length <= 4, usually 1 or 2 characters but taking safe margin)
  // Emojis often have a length of 2 in JS string length.
  // We can just check if it exists in CATEGORY_ICONS first.
  let mappedIcon = icon as CategoryIconName;
  if (EMOJI_TO_LUCIDE[icon]) {
    mappedIcon = EMOJI_TO_LUCIDE[icon];
  }

  const IconComponent = CATEGORY_ICONS[mappedIcon];

  if (IconComponent) {
    return <IconComponent className={className} />;
  }

  // Fallback to text (emoji)
  return <span className={`inline-flex items-center justify-center ${className}`}>{icon || "🏷️"}</span>;
}
