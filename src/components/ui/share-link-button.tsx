"use client";

import { useState, type MouseEvent } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard, toAbsoluteUrl } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** App-relative path (e.g. `/dashboard/wishlist?item=…`) or absolute URL. */
  path: string;
  label?: string;
  successMessage?: string;
  className?: string;
  size?: "sm" | "default" | "icon-sm" | "icon";
  variant?: "outline" | "ghost" | "secondary";
  /** Stop click from bubbling (e.g. when nested in a card button). */
  stopPropagation?: boolean;
};

export function ShareLinkButton({
  path,
  label = "Share",
  successMessage = "Link copied",
  className,
  size = "sm",
  variant = "outline",
  stopPropagation = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const iconOnly = size === "icon" || size === "icon-sm";

  const share = async (e: MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const url = toAbsoluteUrl(path);
    const ok = await copyToClipboard(url);
    if (!ok) {
      toast.error("Could not copy link");
      return;
    }
    setCopied(true);
    toast.success(successMessage);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={(e) => void share(e)}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn(
        "border-gold/30 text-gold hover:border-gold/50 hover:bg-gold/10",
        className
      )}
    >
      {copied ? (
        <Check className={cn("h-3.5 w-3.5", !iconOnly && "mr-1.5")} />
      ) : (
        <Share2 className={cn("h-3.5 w-3.5", !iconOnly && "mr-1.5")} />
      )}
      {!iconOnly && (copied ? "Copied" : label)}
    </Button>
  );
}
