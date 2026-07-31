export type WorkoutBodyPart =
  | "arms"
  | "shoulders"
  | "chest"
  | "abs"
  | "back"
  | "butt";

export const BODY_PARTS: WorkoutBodyPart[] = [
  "arms",
  "shoulders",
  "chest",
  "abs",
  "back",
  "butt",
];

export const BODY_PART_LABELS: Record<WorkoutBodyPart, string> = {
  arms: "Arms",
  shoulders: "Shoulders",
  chest: "Chest",
  abs: "Abs",
  back: "Back",
  butt: "Butt",
};

export const CUSTOM_EXERCISE_VALUE = "__custom__";

export const WORKOUT_EXERCISES: Record<WorkoutBodyPart, string[]> = {
  arms: [
    "Bicep Curl",
    "Hammer Curl",
    "Tricep Pushdown",
    "Skull Crushers",
    "Preacher Curl",
    "Cable Curl",
    "Overhead Tricep Extension",
    "Dips",
    "Concentration Curl",
    "Close-Grip Bench Press",
  ],
  shoulders: [
    "Overhead Press",
    "Lateral Raise",
    "Front Raise",
    "Rear Delt Fly",
    "Arnold Press",
    "Upright Row",
    "Face Pull",
    "Shrugs",
    "Cable Lateral Raise",
    "Push Press",
  ],
  chest: [
    "Bench Press",
    "Incline Bench Press",
    "Decline Bench Press",
    "Dumbbell Fly",
    "Cable Crossover",
    "Push-Up",
    "Chest Dip",
    "Pec Deck",
    "Incline Dumbbell Press",
    "Machine Chest Press",
  ],
  abs: [
    "Crunch",
    "Plank",
    "Leg Raise",
    "Russian Twist",
    "Cable Crunch",
    "Hanging Leg Raise",
    "Ab Wheel Rollout",
    "Bicycle Crunch",
    "Dead Bug",
    "Mountain Climber",
  ],
  back: [
    "Pull-Up",
    "Lat Pulldown",
    "Barbell Row",
    "Dumbbell Row",
    "Seated Cable Row",
    "T-Bar Row",
    "Deadlift",
    "Face Pull",
    "Hyperextension",
    "Single-Arm Row",
  ],
  butt: [
    "Hip Thrust",
    "Glute Bridge",
    "Romanian Deadlift",
    "Bulgarian Split Squat",
    "Cable Kickback",
    "Sumo Squat",
    "Step-Up",
    "Good Morning",
    "Glute Kickback",
    "Smith Machine Squat",
  ],
};
