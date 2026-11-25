// The starter routine every new user gets: the UpOne Coaching 4-day plan.
// Ids are fixed so two devices seeding at once produce the same rows, and the
// seed's updated_at is 1 so any real edit always wins a merge.
// Day ids d1–d4 match sets logged before routines were editable.
// Exercise rows: [exerciseId, sets, repLow, repHigh, warmup, supersetWithNext]

export const STARTER = {
  id: "starter",
  name: "UpOne 4-Day Plan",
  tempo: "3:1:2:1",
  days: [
    { id: "d1", name: "Push", subtitle: "Chest / Shoulders / Triceps", exercises: [
      ["incline-db-press", 2, 6, 8, 1],
      ["machine-chest-press", 3, 8, 10, 1],
      ["machine-shoulder-press", 2, 8, 10, 1],
      ["lateral-raise", 3, 10, 15, 0],
      ["overhead-rope-extension", 2, 10, 15, 0],
      ["tricep-pushdown", 2, 12, 15, 0],
    ] },
    { id: "d2", name: "Pull", subtitle: "Back / Rear Delts / Biceps", exercises: [
      ["pullup", 2, 6, 10, 0],
      ["lat-pulldown", 2, 6, 10, 1],
      ["chest-supported-db-row", 3, 8, 10, 1],
      ["db-rear-delt-fly", 3, 10, 15, 0],
      ["incline-db-curl", 3, 10, 15, 0],
    ] },
    { id: "d3", name: "Legs", subtitle: "2 Isolations / 2 Compounds", exercises: [
      ["seated-hamstring-curl", 3, 12, 15, 0],
      ["leg-extension", 3, 12, 15, 0],
      ["leg-press", 3, 6, 10, 1],
      ["rdl", 3, 8, 10, 1],
    ] },
    { id: "d4", name: "Upper", subtitle: "2 Chest / 1 Back / 1 Shoulder / Arm Superset", exercises: [
      ["incline-smith-press", 3, 6, 10, 1],
      ["lat-pulldown", 2, 8, 10, 1],
      ["pec-deck-fly", 2, 10, 15, 0],
      ["lateral-raise", 3, 10, 12, 0],
      ["cable-curl", 3, 12, 15, 0, 1],
      ["straight-bar-pushdown", 3, 12, 15, 0],
    ] },
  ],
};
