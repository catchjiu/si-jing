import { cn } from "@/lib/utils";

export function formatCountBadge(count: number) {
  return count > 9 ? "9+" : String(count);
}

export function FlirtCountBadge({
  count,
  className,
  size = "md",
}: {
  count: number;
  className?: string;
  size?: "sm" | "md";
}) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-gold font-semibold text-void",
        size === "sm"
          ? "h-4 min-w-4 px-1 text-[10px]"
          : "h-5 min-w-5 px-1.5 text-[10px]",
        className
      )}
    >
      {formatCountBadge(count)}
    </span>
  );
}
