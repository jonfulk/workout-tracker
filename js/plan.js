// The training plan, transcribed from the UpOne Coaching 4-day program.
// Exercise ids are shared across days when it's the same movement
// (e.g. lat pulldown on Day 2 and Day 4), so history carries over.
//
// sets: max sets to show. minSets: optional lower bound for "2–3" style ranges.
// main: true shows the warm-up suggestion (1–2 sets at 60–75% of working weight).

export const TEMPO = "3:1:2:1";

export const PLAN = [
  {
    id: "d1",
    name: "Day 1",
    title: "Push",
    focus: "Chest / Shoulders / Triceps",
    exercises: [
      { id: "incline-db-press", name: "Incline Dumbbell Press", sets: 2, reps: [6, 8], main: true,
        note: "Lower slowly to chest level, elbows slightly tucked, press smoothly." },
      { id: "machine-chest-press", name: "Machine Chest Press", sets: 3, reps: [8, 10], main: true,
        note: "Bring your elbows together at the top." },
      { id: "machine-shoulder-press", name: "Machine Shoulder Press", sets: 2, reps: [8, 10], main: true,
        note: "Back flat against the pad, chest tall. Lower until your hands reach about chin level, press straight up without locking your elbows." },
      { id: "lateral-raise", name: "Lateral Raise", sets: 3, reps: [10, 15],
        note: "Lead with your elbows, avoid shrugging, control when lowering the weight." },
      { id: "overhead-rope-extension", name: "Overhead Rope Extension", sets: 2, reps: [10, 15],
        note: "Keep elbows tucked and close to head, extend rope out in front of you and twist pinky outwards." },
      { id: "tricep-pushdown", name: "Tricep Pushdown", sets: 2, reps: [12, 15],
        note: "Keep elbows still, push bar straight down, pause at bottom." },
    ],
  },
  {
    id: "d2",
    name: "Day 2",
    title: "Pull",
    focus: "Back / Rear Delts / Biceps",
    exercises: [
      { id: "pullup", name: "Assisted / Unassisted Pull-ups", sets: 2, reps: [6, 10], main: false,
        note: "Pull elbows towards your ribs, chest up, lower under control. Assisted as needed — log the assist weight as a negative number (e.g. -40)." },
      { id: "lat-pulldown", name: "Lat Pulldown", sets: 2, reps: [6, 10], main: true,
        note: "Pull elbows down toward ribs, chest tall, avoid leaning back." },
      { id: "chest-supported-db-row", name: "Chest Supported Dumbbell Row", sets: 3, reps: [8, 10], main: true,
        note: "Drive elbows up and back, squeeze shoulder blades, avoid shrugging." },
      { id: "db-rear-delt-fly", name: "Dumbbell Rear Delt Fly", sets: 3, reps: [10, 15],
        note: "Lead with elbows outwards then slightly upwards, keep arms slightly bent, avoid shrugging." },
      { id: "incline-db-curl", name: "Incline Dumbbell Curl", sets: 3, reps: [10, 15],
        note: "Keep elbows behind your body, curl from upper forearm to lower bicep — NOT dumbbell to shoulder. Lower slowly." },
    ],
  },
  {
    id: "d3",
    name: "Day 3",
    title: "Legs",
    focus: "2 Isolations / 2 Compounds",
    exercises: [
      { id: "seated-hamstring-curl", name: "Seated Hamstring Curl", sets: 3, reps: [12, 15],
        note: "Pull heels back, squeeze hamstrings, control the return." },
      { id: "leg-extension", name: "Leg Extension", sets: 3, reps: [12, 15],
        note: "Push out and upwards in a scooping motion, extend fully, squeeze your quads, lower slowly with control." },
      { id: "leg-press", name: "Leg Press", sets: 3, reps: [6, 10], main: true,
        note: "Lower under control, drive through mid-foot, avoid locking out knees." },
      { id: "rdl", name: "Romanian Deadlift (RDL)", sets: 3, reps: [8, 10], main: true,
        note: "Push hips back, keep a soft knee bend, stretch hamstrings before driving hips through." },
    ],
  },
  {
    id: "d4",
    name: "Day 4",
    title: "Upper",
    focus: "2 Chest / 1 Back / 1 Shoulder / Arm Superset",
    exercises: [
      { id: "incline-smith-press", name: "Incline Smith Press", sets: 3, reps: [6, 10], main: true,
        note: "Lower to upper chest, elbows tucked, press up smoothly." },
      { id: "lat-pulldown", name: "Lat Pulldown", sets: 2, reps: [8, 10], main: true,
        note: "Pull elbows down toward ribs, chest tall, avoid leaning back." },
      { id: "pec-deck-fly", name: "Pec Deck Fly", sets: 2, reps: [10, 15],
        note: "Keep a slight bend in your elbows, squeeze your chest, control the return." },
      { id: "lateral-raise", name: "Dumbbell Lateral Raises", sets: 3, reps: [10, 12],
        note: "Lead with your elbows, avoid shrugging, control when lowering the weight." },
      { id: "cable-curl", name: "Cable Curl", superset: "A", sets: 3, minSets: 2, reps: [12, 15],
        note: "Superset with the pushdown. Curl slowly, elbows tucked." },
      { id: "straight-bar-pushdown", name: "Straight Bar Pushdown", superset: "A", sets: 3, minSets: 2, reps: [12, 15],
        note: "Superset with the curl. Push bar straight down, pause at bottom." },
    ],
  },
];

export function findDay(id) {
  return PLAN.find((d) => d.id === id) || PLAN[0];
}
