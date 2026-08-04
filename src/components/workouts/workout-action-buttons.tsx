"use client";

import Link from "next/link";
import { CalendarPlus, Dumbbell, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkoutActionButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild className="bg-gold text-void hover:bg-gold-muted">
        <Link href="/dashboard/workouts/log">
          <Dumbbell className="mr-2 h-4 w-4" />
          Log workout
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="border-gold/30 text-gold hover:bg-gold/10"
      >
        <Link href="/dashboard/workouts/plan">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Plan workout
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="border-gold/30 text-muted-foreground hover:text-ivory"
      >
        <Link href="/dashboard/workouts/rest">
          <Moon className="mr-2 h-4 w-4" />
          Rest day
        </Link>
      </Button>
    </div>
  );
}
