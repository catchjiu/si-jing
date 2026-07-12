import Image from "next/image";
import { cn } from "@/lib/utils";

const sizes = {
  sm: 28,
  md: 40,
  lg: 72,
  hero: 168,
} as const;

/** Bump this when replacing the brand image so caches refresh. */
const BRAND_SRC = "/brand/queen.jpg";

type BrandLogoProps = {
  size?: keyof typeof sizes;
  className?: string;
  /** Circular crop for nav avatars */
  rounded?: "full" | "lg" | "none";
  priority?: boolean;
};

export function BrandLogo({
  size = "md",
  className,
  rounded = "lg",
  priority = false,
}: BrandLogoProps) {
  const px = sizes[size];
  return (
    <Image
      src={BRAND_SRC}
      alt="Queen Sisi"
      width={px}
      height={px}
      priority={priority}
      className={cn(
        "object-cover shrink-0 border border-gold/30 bg-void",
        rounded === "full" && "rounded-full",
        rounded === "lg" && "rounded-xl",
        rounded === "none" && "rounded-none",
        size === "hero" && "glow-gold",
        className
      )}
    />
  );
}
