"use client";

import Link from "next/link";
import { CalendarPlus, Dumbbell, Moon } from "lucide-react";
import type { WorkoutAthleteRole } from "@/lib/types";
import { workoutBasePath } from "@/lib/workout-persist";
import { Button } from "@/components/ui/button";

export function WorkoutActionButtons({
  athleteRole = "slave",
}: {
  athleteRole?: WorkoutAthleteRole;
}) {
  const basePath = workoutBasePath(athleteRole);
  const isQueenTrack = athleteRole === "queen";

  return (
    <div className="flex flex-wrap gap-2">
      {!isQueenTrack && (
        <Button asChild className="bg-gold text-void hover:bg-gold-muted">
          <Link href={`${basePath}/log`}>
            <Dumbbell className="mr-2 h-4 w-4" />
            Log workout
          </Link>
        </Button>
      )}
      <Button
        asChild
        variant={isQueenTrack ? "default" : "outline"}
        className={
          isQueenTrack
            ? "bg-gold text-void hover:bg-gold-muted"
            : "border-gold/30 text-gold hover:bg-gold/10"
        }
      >
        <Link href={`${basePath}/plan`}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          Plan workout
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="border-gold/30 text-muted-foreground hover:text-ivory"
      >
        <Link href={`${basePath}/rest`}>
          <Moon className="mr-2 h-4 w-4" />
          Rest day
        </Link>
      </Button>
    </div>
  );
}
