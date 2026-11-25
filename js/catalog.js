// Built-in exercise catalog. Ids are permanent: logged sets point at them.
// [id, name, muscle, equipment, main (gets warm-up sets), form cues]

export const MUSCLES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Core"];

const RAW = [
  // Chest
  ["incline-db-press", "Incline Dumbbell Press", "Chest", "Dumbbell", 1, "Lower slowly to chest level, elbows slightly tucked, press smoothly."],
  ["flat-db-press", "Flat Dumbbell Press", "Chest", "Dumbbell", 1, "Shoulder blades pinched, lower to mid-chest, press up and slightly in."],
  ["barbell-bench-press", "Barbell Bench Press", "Chest", "Barbell", 1, "Feet planted, shoulder blades back, touch mid-chest, press in a slight arc toward the rack."],
  ["incline-barbell-press", "Incline Barbell Press", "Chest", "Barbell", 1, "Bench at 30°, lower to upper chest, elbows under the bar."],
  ["incline-smith-press", "Incline Smith Press", "Chest", "Smith machine", 1, "Lower to upper chest, elbows tucked, press up smoothly."],
  ["flat-smith-press", "Smith Machine Bench Press", "Chest", "Smith machine", 1, "Bar path over mid-chest, shoulder blades back, don't bounce."],
  ["machine-chest-press", "Machine Chest Press", "Chest", "Machine", 1, "Bring your elbows together at the top."],
  ["incline-machine-press", "Incline Machine Press", "Chest", "Machine", 1, "Seat so handles line up with upper chest, press without shrugging."],
  ["pec-deck-fly", "Pec Deck Fly", "Chest", "Machine", 0, "Keep a slight bend in your elbows, squeeze your chest, control the return."],
  ["cable-fly", "Cable Fly", "Chest", "Cable", 0, "Slight elbow bend, hug a wide tree, squeeze at the middle."],
  ["low-to-high-cable-fly", "Low-to-High Cable Fly", "Chest", "Cable", 0, "Pulleys low, sweep hands up to chin height, squeeze upper chest."],
  ["db-fly", "Dumbbell Fly", "Chest", "Dumbbell", 0, "Slight elbow bend, stretch wide without going past shoulder level."],
  ["push-up", "Push-up", "Chest", "Bodyweight", 0, "Body in a straight line, elbows at about 45°, chest to the floor."],
  ["dip", "Dip", "Chest", "Bodyweight", 1, "Lean slightly forward, lower until shoulders are just below elbows. Log assist as a negative weight."],

  // Back
  ["pullup", "Pull-up", "Back", "Bodyweight", 1, "Pull elbows towards your ribs, chest up, lower under control. Assisted? Log the assist weight as a negative number (e.g. -40)."],
  ["chin-up", "Chin-up", "Back", "Bodyweight", 1, "Palms facing you, pull chest to the bar, full hang at the bottom. Log assist as a negative weight."],
  ["lat-pulldown", "Lat Pulldown", "Back", "Cable", 1, "Pull elbows down toward ribs, chest tall, avoid leaning back."],
  ["close-grip-pulldown", "Close-Grip Pulldown", "Back", "Cable", 1, "Neutral handle, pull to upper chest, elbows drive down and back."],
  ["single-arm-pulldown", "Single-Arm Cable Pulldown", "Back", "Cable", 0, "Pull elbow down to your hip, long stretch at the top."],
  ["chest-supported-db-row", "Chest Supported Dumbbell Row", "Back", "Dumbbell", 1, "Drive elbows up and back, squeeze shoulder blades, avoid shrugging."],
  ["one-arm-db-row", "One-Arm Dumbbell Row", "Back", "Dumbbell", 1, "Flat back, pull the dumbbell to your hip, don't twist."],
  ["barbell-row", "Barbell Row", "Back", "Barbell", 1, "Hinge to about 45°, pull bar to lower ribs, keep the back flat."],
  ["seated-cable-row", "Seated Cable Row", "Back", "Cable", 1, "Chest tall, pull to your stomach, squeeze shoulder blades, don't rock."],
  ["machine-row", "Machine Row", "Back", "Machine", 1, "Chest on the pad, drive elbows back, pause and squeeze."],
  ["t-bar-row", "T-Bar Row", "Back", "Machine", 1, "Chest supported or braced, pull to your stomach, control the stretch."],
  ["straight-arm-pulldown", "Straight-Arm Pulldown", "Back", "Cable", 0, "Arms nearly straight, sweep the bar to your thighs with your lats."],
  ["deadlift", "Deadlift", "Back", "Barbell", 1, "Bar over mid-foot, flat back, push the floor away, lock out with glutes."],
  ["back-extension", "Back Extension", "Back", "Bodyweight", 0, "Hinge at the hips, rise until body is straight, don't hyperextend."],
  ["db-shrug", "Dumbbell Shrug", "Back", "Dumbbell", 0, "Shoulders straight up to ears, pause, lower slowly. No rolling."],

  // Shoulders
  ["machine-shoulder-press", "Machine Shoulder Press", "Shoulders", "Machine", 1, "Back flat against the pad, chest tall. Lower until your hands reach about chin level, press straight up without locking your elbows."],
  ["seated-db-shoulder-press", "Seated Dumbbell Shoulder Press", "Shoulders", "Dumbbell", 1, "Back on the pad, lower to ear level, press up without clanking the dumbbells."],
  ["standing-ohp", "Standing Overhead Press", "Shoulders", "Barbell", 1, "Glutes tight, press bar straight up, move your head through at the top."],
  ["smith-shoulder-press", "Smith Machine Shoulder Press", "Shoulders", "Smith machine", 1, "Bar in front of your face, lower to chin level, press without arching."],
  ["arnold-press", "Arnold Press", "Shoulders", "Dumbbell", 1, "Start palms facing you, rotate out as you press, reverse on the way down."],
  ["lateral-raise", "Dumbbell Lateral Raise", "Shoulders", "Dumbbell", 0, "Lead with your elbows, avoid shrugging, control when lowering the weight."],
  ["cable-lateral-raise", "Cable Lateral Raise", "Shoulders", "Cable", 0, "Cable from behind or in front, lift elbow out to shoulder height, slow down."],
  ["machine-lateral-raise", "Machine Lateral Raise", "Shoulders", "Machine", 0, "Pads on outer arms, lift with elbows, don't shrug."],
  ["db-rear-delt-fly", "Dumbbell Rear Delt Fly", "Shoulders", "Dumbbell", 0, "Lead with elbows outwards then slightly upwards, keep arms slightly bent, avoid shrugging."],
  ["reverse-pec-deck", "Reverse Pec Deck", "Shoulders", "Machine", 0, "Arms nearly straight, sweep back to your sides, squeeze rear delts."],
  ["face-pull", "Face Pull", "Shoulders", "Cable", 0, "Rope at eye level, pull toward your face, hands finish beside your ears."],
  ["front-raise", "Front Raise", "Shoulders", "Dumbbell", 0, "Raise to eye level with a slight elbow bend, lower slowly."],
  ["upright-row", "Cable Upright Row", "Shoulders", "Cable", 0, "Wide grip, lead with elbows to chest height, stop if shoulders pinch."],

  // Biceps
  ["incline-db-curl", "Incline Dumbbell Curl", "Biceps", "Dumbbell", 0, "Keep elbows behind your body, curl from upper forearm to lower bicep — NOT dumbbell to shoulder. Lower slowly."],
  ["db-curl", "Dumbbell Curl", "Biceps", "Dumbbell", 0, "Elbows pinned at your sides, turn palms up as you curl, lower slowly."],
  ["hammer-curl", "Hammer Curl", "Biceps", "Dumbbell", 0, "Palms facing each other, elbows still, no swinging."],
  ["barbell-curl", "Barbell Curl", "Biceps", "Barbell", 0, "Elbows at your sides, curl without leaning back."],
  ["ez-bar-curl", "EZ-Bar Curl", "Biceps", "Barbell", 0, "Grip the angled part, elbows still, full stretch at the bottom."],
  ["preacher-curl", "Preacher Curl", "Biceps", "Machine", 0, "Armpits on the pad, lower to almost straight, don't drop the last bit."],
  ["cable-curl", "Cable Curl", "Biceps", "Cable", 0, "Curl slowly, elbows tucked."],
  ["bayesian-curl", "Bayesian Cable Curl", "Biceps", "Cable", 0, "Face away from the pulley, arm behind you, curl without moving the elbow."],
  ["concentration-curl", "Concentration Curl", "Biceps", "Dumbbell", 0, "Elbow braced on inner thigh, curl and squeeze at the top."],

  // Triceps
  ["tricep-pushdown", "Tricep Pushdown", "Triceps", "Cable", 0, "Keep elbows still, push bar straight down, pause at bottom."],
  ["straight-bar-pushdown", "Straight Bar Pushdown", "Triceps", "Cable", 0, "Push bar straight down, pause at bottom."],
  ["rope-pushdown", "Rope Pushdown", "Triceps", "Cable", 0, "Elbows pinned, push down and spread the rope at the bottom."],
  ["overhead-rope-extension", "Overhead Rope Extension", "Triceps", "Cable", 0, "Keep elbows tucked and close to head, extend rope out in front of you and twist pinky outwards."],
  ["overhead-db-extension", "Overhead Dumbbell Extension", "Triceps", "Dumbbell", 0, "Both hands on one dumbbell, elbows pointing up, lower behind your head."],
  ["skull-crusher", "Skull Crusher", "Triceps", "Barbell", 0, "Lower the bar to your forehead or just behind, elbows stay pointed up."],
  ["close-grip-bench", "Close-Grip Bench Press", "Triceps", "Barbell", 1, "Hands shoulder-width, elbows tucked, touch lower chest."],
  ["single-arm-pushdown", "Single-Arm Cable Pushdown", "Triceps", "Cable", 0, "Elbow at your side, extend fully, squeeze."],
  ["tricep-dip-machine", "Machine Tricep Dip", "Triceps", "Machine", 0, "Elbows back, press down to full lockout, control up."],

  // Quads
  ["leg-press", "Leg Press", "Quads", "Machine", 1, "Lower under control, drive through mid-foot, avoid locking out knees."],
  ["leg-extension", "Leg Extension", "Quads", "Machine", 0, "Push out and upwards in a scooping motion, extend fully, squeeze your quads, lower slowly with control."],
  ["back-squat", "Back Squat", "Quads", "Barbell", 1, "Brace, sit between your heels, knees track over toes, drive up."],
  ["front-squat", "Front Squat", "Quads", "Barbell", 1, "Elbows high, torso upright, sit straight down."],
  ["hack-squat", "Hack Squat", "Quads", "Machine", 1, "Back flat on the pad, go deep, push through the whole foot."],
  ["smith-squat", "Smith Machine Squat", "Quads", "Smith machine", 1, "Feet slightly forward, sit down between your heels, don't lock out hard."],
  ["goblet-squat", "Goblet Squat", "Quads", "Dumbbell", 1, "Dumbbell at your chest, elbows inside knees at the bottom, chest up."],
  ["bulgarian-split-squat", "Bulgarian Split Squat", "Quads", "Dumbbell", 1, "Back foot on bench, front knee tracks over toes, drop straight down."],
  ["walking-lunge", "Walking Lunge", "Quads", "Dumbbell", 0, "Long step, back knee near the floor, push through the front heel."],
  ["reverse-lunge", "Reverse Lunge", "Quads", "Dumbbell", 0, "Step back, both knees at 90°, drive up through the front foot."],
  ["step-up", "Step-up", "Quads", "Dumbbell", 0, "Whole foot on the box, drive up without pushing off the back leg."],
  ["sissy-squat", "Sissy Squat", "Quads", "Bodyweight", 0, "Hold support, knees forward, lean back, keep hips extended."],

  // Hamstrings
  ["rdl", "Romanian Deadlift (RDL)", "Hamstrings", "Barbell", 1, "Push hips back, keep a soft knee bend, stretch hamstrings before driving hips through."],
  ["db-rdl", "Dumbbell RDL", "Hamstrings", "Dumbbell", 1, "Dumbbells close to legs, hips back, flat back, stop at a deep stretch."],
  ["seated-hamstring-curl", "Seated Hamstring Curl", "Hamstrings", "Machine", 0, "Pull heels back, squeeze hamstrings, control the return."],
  ["lying-hamstring-curl", "Lying Hamstring Curl", "Hamstrings", "Machine", 0, "Hips pressed down, curl heels to glutes, lower slowly."],
  ["stiff-leg-deadlift", "Stiff-Leg Deadlift", "Hamstrings", "Barbell", 1, "Legs nearly straight, hinge from hips, feel the hamstring stretch."],
  ["good-morning", "Good Morning", "Hamstrings", "Barbell", 0, "Bar on upper back, soft knees, hinge until torso is near parallel."],
  ["nordic-curl", "Nordic Curl", "Hamstrings", "Bodyweight", 0, "Ankles anchored, lower your body as slowly as you can."],

  // Glutes
  ["hip-thrust", "Barbell Hip Thrust", "Glutes", "Barbell", 1, "Upper back on bench, chin tucked, drive hips up and squeeze, shins vertical at the top."],
  ["machine-hip-thrust", "Machine Hip Thrust", "Glutes", "Machine", 1, "Pause at the top, don't arch your lower back."],
  ["glute-bridge", "Glute Bridge", "Glutes", "Bodyweight", 0, "Feet close, push through heels, squeeze at the top."],
  ["cable-kickback", "Cable Glute Kickback", "Glutes", "Cable", 0, "Slight forward lean, kick back and up, don't arch."],
  ["hip-abduction", "Hip Abduction Machine", "Glutes", "Machine", 0, "Lean slightly forward, push knees out, control back in."],
  ["hip-adduction", "Hip Adduction Machine", "Glutes", "Machine", 0, "Squeeze legs together, slow on the way out."],

  // Calves
  ["standing-calf-raise", "Standing Calf Raise", "Calves", "Machine", 0, "Full stretch at the bottom, pause, rise all the way up on big toe."],
  ["seated-calf-raise", "Seated Calf Raise", "Calves", "Machine", 0, "Deep stretch, pause, squeeze at the top."],
  ["leg-press-calf-raise", "Leg Press Calf Raise", "Calves", "Machine", 0, "Balls of feet on the edge, knees straight but not locked, full range."],

  // Core
  ["plank", "Plank", "Core", "Bodyweight", 0, "Straight line from head to heels, squeeze glutes. Log seconds as reps."],
  ["hanging-leg-raise", "Hanging Leg Raise", "Core", "Bodyweight", 0, "No swinging, curl hips up, lower slowly."],
  ["cable-crunch", "Cable Crunch", "Core", "Cable", 0, "Kneel, rope at your head, curl ribs to hips, hips stay still."],
  ["ab-wheel", "Ab Wheel Rollout", "Core", "Bodyweight", 0, "Brace hard, roll out only as far as you can keep a flat back."],
  ["machine-crunch", "Machine Crunch", "Core", "Machine", 0, "Curl your chest toward your hips, exhale hard, control back."],
  ["pallof-press", "Pallof Press", "Core", "Cable", 0, "Stand side-on to the cable, press out and resist the twist."],
  ["russian-twist", "Russian Twist", "Core", "Bodyweight", 0, "Lean back, rotate from the ribs, touch each side."],
  ["dead-bug", "Dead Bug", "Core", "Bodyweight", 0, "Lower back pressed down, extend opposite arm and leg slowly."],
  ["farmers-carry", "Farmer's Carry", "Core", "Dumbbell", 0, "Heavy dumbbells, tall posture, short quick steps. Log steps or seconds as reps."],
];

export const CATALOG = RAW.map(([id, name, muscle, equipment, main, cues]) => ({ id, name, muscle, equipment, main: !!main, cues, custom: false }));

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

export function catalogExercise(id) {
  return BY_ID.get(id) || null;
}
