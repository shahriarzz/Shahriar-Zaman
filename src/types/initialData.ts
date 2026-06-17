import { Workout } from './fitness';

export const INITIAL_WORKOUTS: Workout[] = [
  {id:'push-a',name:'Push Day A',badge:'DAY 1 · PUSH A',type:'push',cycleDay:1,isCore:true,isRest:false,
   exercises:[
    {id:'e1',name:'Incline DB Press',target:'Upper Chest',sets:4,reps:'8–10',tags:['priority'],note:'45° elbow tuck; focus on the deep stretch.'},
    {id:'e2',name:'DB Shoulder Press',target:'Shoulders Overall',sets:3,reps:'8–10',tags:[],note:'Keep palms slightly inward for joint safety.'},
    {id:'e3',name:'Flat Machine Press',target:'Mid Chest',sets:3,reps:'10–12',tags:[],note:'Keep shoulder blades pinned; don\'t lock out elbows.'},
    {id:'e4',name:'Cable Lateral Raise',target:'Side Delts',sets:3,reps:'12–15',tags:['priority'],note:'Pull across the body; constant tension.'},
    {id:'e5',name:'V-Bar Pushdown',target:'Triceps',sets:3,reps:'10–12',tags:[],note:'Heavy power move; keep elbows glued to your ribs.'},
    {id:'e6',name:'Barbell Wrist Curl',target:'Inner Forearm',sets:3,reps:'15–20',tags:['daily'],note:'Let bar roll to fingertips for maximum mass.'},
   ],cardio:{name:'Incline Treadmill Walk',detail:'12% incline · 4.5 km/h · No rail holds',dur:"10'"}},

  {id:'pull-a',name:'Pull Day A',badge:'DAY 2 · PULL A',type:'pull',cycleDay:2,isCore:true,isRest:false,
   exercises:[
    {id:'e7',name:'Lat Pulldown (Wide)',target:'Lats Width',sets:3,reps:'10–12',tags:[],note:'Pull with your elbows; arch back slightly at bottom.'},
    {id:'e8',name:'Seated Cable Row',target:'Mid-Back',sets:3,reps:'10–12',tags:[],note:'Neutral grip; squeeze shoulder blades hard for 1 sec.'},
    {id:'e9',name:'Face Pulls',target:'Rear Delts',sets:3,reps:'15–20',tags:['priority'],note:'Pull rope toward ears; keep elbows high.'},
    {id:'e10',name:'Straight-Arm Pulldown',target:'Lats/V-Taper',sets:3,reps:'12–15',tags:[],note:'Finish the V-taper; keep arms straight throughout.'},
    {id:'e11',name:'Hammer Curls',target:'Forearm/Bicep',sets:3,reps:'10–12',tags:['daily'],note:'Thumbs up; fills the top of the forearm/arm.'},
   ],cardio:{name:'Stationary Bike',detail:'Moderate pace; steady rhythmic breathing',dur:"10'"}},

  {id:'hybrid-a',name:'Hybrid Day A',badge:'DAY 3 · HYBRID A',type:'hybrid',cycleDay:3,isCore:true,isRest:false,
   exercises:[
    {id:'e12',name:'Pec Deck Fly',target:'Inner Chest',sets:3,reps:'12–15',tags:[],note:'Massive stretch; don\'t let handles touch.'},
    {id:'e13',name:'Cable Crossover',target:'Chest Stretch',sets:3,reps:'12–15',tags:[],note:'Focus on the hug and the squeeze at the center.'},
    {id:'e14',name:'Goblet Squat',target:'Quads/Glutes',sets:3,reps:'10–12',tags:[],note:'Deep reps; hold weight tight to your collarbone.'},
    {id:'e15',name:'Romanian Deadlift',target:'Hamstrings/Back',sets:3,reps:'12',tags:[],note:'Push hips back; keep weights close to your shins.'},
    {id:'e16',name:'Plate Pinch Holds',target:'Grip/Forearm',sets:3,reps:'Max',tags:['daily'],note:'Squeeze two plates; hold until failure.'},
   ],cardio:{name:'Fast Incline Walk',detail:'15% incline · High metabolic demand',dur:"10'"}},

  {id:'rest-1',name:'Recovery Day',badge:'DAY 4 · REST',type:'rest',cycleDay:4,isCore:true,isRest:true,
   exercises:[],restNotes:['122g Protein · Hit your target','3L Water · Full hydration','CNS & Muscle Repair · No training'],cardio:null},

  {id:'push-b',name:'Push Day B',badge:'DAY 5 · PUSH B',type:'push',cycleDay:5,isCore:true,isRest:false,
   exercises:[
    {id:'e17',name:'Incline Machine Press',target:'Upper Chest',sets:4,reps:'10–12',tags:['priority'],note:'Safe to push to absolute muscle failure.'},
    {id:'e18',name:'Machine Shoulder Press',target:'Shoulders Mass',sets:3,reps:'10–12',tags:[],note:'Excellent for heavy, stable loading on the delts.'},
    {id:'e19',name:'DB Lateral Raise',target:'Side Delts',sets:3,reps:'15–20',tags:['priority'],note:'Lean slightly forward; pinky-finger up.'},
    {id:'e20',name:'Reverse Pec Deck',target:'Rear Delts',sets:3,reps:'12–15',tags:[],note:'Palms facing each other; keep constant tension.'},
    {id:'e21',name:'Overhead Cable Ext.',target:'Tricep Long Head',sets:3,reps:'10–12',tags:[],note:'Hits the back of the arm for side-profile girth.'},
    {id:'e22',name:'Reverse BB Curl',target:'Top Forearm',sets:3,reps:'12–15',tags:['daily'],note:'Overhand grip for the watch-popping muscle.'},
   ],cardio:{name:'Bike Intervals',detail:'30s fast / 30s slow recovery',dur:"10'"}},

  {id:'pull-b',name:'Pull Day B',badge:'DAY 6 · PULL B',type:'pull',cycleDay:6,isCore:true,isRest:false,
   exercises:[
    {id:'e23',name:'Chest Supported Row',target:'Mid-Back',sets:3,reps:'8–10',tags:[],note:'Drive elbows back; eliminate all body momentum.'},
    {id:'e24',name:'Lat Pulldown (Close)',target:'Lower Lats',sets:3,reps:'10–12',tags:[],note:'Use V-Bar; pull toward your lower ribs.'},
    {id:'e25',name:'Single-Arm Cable Fly',target:'Rear Delts',sets:3,reps:'15 ea',tags:[],note:'Stand upright; pull cable across body.'},
    {id:'e26',name:'EZ-Bar Bicep Curls',target:'Biceps',sets:3,reps:'10–12',tags:[],note:'Focus on the peak squeeze at the top.'},
    {id:'e27',name:'Wrist Rotations (DB)',target:'Forearm Rot.',sets:3,reps:'12 ea',tags:['daily'],note:'Hold DB at very end; rotate slowly.'},
   ],cardio:{name:"Farmer's Carry",detail:'Heavy DBs · Tall chest, proud posture',dur:"10'"}},

  {id:'hybrid-b',name:'Hybrid Day B',badge:'DAY 7 · HYBRID B',type:'hybrid',cycleDay:7,isCore:true,isRest:false,
   exercises:[
    {id:'e28',name:'Machine Lat. Raise',target:'Side Delts',sets:3,reps:'15',tags:[],note:'Constant isolation shoulder finisher.'},
    {id:'e29',name:'Leg Press',target:'Quads/Glutes',sets:3,reps:'12–15',tags:[],note:'Feet shoulder-width; push through your heels.'},
    {id:'e30',name:'Glute Kickback',target:'Glutes',sets:3,reps:'12 ea',tags:[],note:'Slow and controlled; squeeze at the top.'},
    {id:'e31',name:'Seated Calf Raise',target:'Calves',sets:3,reps:'15–20',tags:[],note:'2-sec pause at bottom stretch; explode up.'},
    {id:'e32',name:'Hanging Leg Raises',target:'Abs/Core',sets:3,reps:'15',tags:[],note:'Don\'t swing; use core to lift legs.'},
    {id:'e33',name:'Behind-Back Curls',target:'Inner Forearm',sets:3,reps:'15–20',tags:['daily'],note:'BB behind glutes; short, intense pulses.'},
   ],cardio:{name:'Power Incline Walk',detail:'15% incline · Finish the 8-day cycle strong',dur:"10'"}},

  {id:'rest-2',name:'Recovery Day',badge:'DAY 8 · REST',type:'rest',cycleDay:8,isCore:true,isRest:true,
   exercises:[],restNotes:['Deep sleep 8+ hours · Non-negotiable','Nutrition check · Review macros','Cycle resets tomorrow · Stay ready'],cardio:null},

  {id:'date-night',name:'Date Night',badge:'BONUS · DATE NIGHT',type:'date',cycleDay:null,isCore:false,isRest:false,
   exercises:[
    {id:'b1',name:'Incline DB Press',target:'Upper Chest',sets:4,reps:'10–12',tags:['priority'],note:'Moderate weight, controlled tempo. Pump focus.'},
    {id:'b2',name:'Pec Deck Fly',target:'Inner Chest',sets:3,reps:'12–15',tags:[],note:'Full stretch — the stretch builds the pump.'},
    {id:'b3',name:'DB Lateral Raise',target:'Side Delts',sets:4,reps:'15–20',tags:['priority'],note:'Gives shoulder width that shows in any shirt.'},
    {id:'b4',name:'Machine Shoulder Press',target:'Shoulders',sets:3,reps:'10–12',tags:[],note:'Controlled, not heavy. Pump, not fatigue.'},
    {id:'b5',name:'Cable Curl (Rope)',target:'Biceps/Peak',sets:3,reps:'12–15',tags:[],note:'Supinate hard at the top for the peak.'},
    {id:'b6',name:'Overhead Cable Ext.',target:'Tricep Long Head',sets:3,reps:'12–15',tags:[],note:'Full stretch overhead — big visual impact.'},
    {id:'b7',name:'Barbell Wrist Curl',target:'Inner Forearm',sets:3,reps:'15–20',tags:['daily'],note:'Pumped forearms are the finishing touch.'},
   ],cardio:{name:'Incline Treadmill Walk',detail:'10% incline · Keeps the pump',dur:"10'"}},

  {id:'upper-body',name:'Upper Body',badge:'BONUS · UPPER BODY',type:'upper',cycleDay:null,isCore:false,isRest:false,
   exercises:[
    {id:'c1',name:'Incline Barbell Press',target:'Upper Chest',sets:4,reps:'6–8',tags:['priority'],note:'Main strength driver. Push heavy here.'},
    {id:'c2',name:'Flat DB Press',target:'Mid Chest',sets:3,reps:'8–10',tags:[],note:'Greater range of motion than barbell.'},
    {id:'c3',name:'Weighted Pull-Up',target:'Lats/Back Width',sets:4,reps:'6–8',tags:['priority'],note:'Best bang-for-buck back exercise.'},
    {id:'c4',name:'Chest Supported Row',target:'Mid-Back',sets:3,reps:'8–10',tags:[],note:'No momentum. Pure mid-back isolation.'},
    {id:'c5',name:'Cable Lateral Raise',target:'Side Delts',sets:4,reps:'12–15',tags:['priority'],note:'Shoulder priority — don\'t rush it.'},
    {id:'c6',name:'EZ-Bar Curl',target:'Biceps',sets:3,reps:'10–12',tags:[],note:'Controlled negative on the way down (2–3 sec).'},
    {id:'c7',name:'Close-Grip Bench Press',target:'Triceps',sets:3,reps:'8–10',tags:[],note:'Compounds build tricep mass faster than pushdowns.'},
   ],cardio:{name:'Bike Intervals',detail:'30s hard / 30s easy · Post-upper session',dur:"10'"}},

  {id:'lower-body',name:'Lower Body',badge:'BONUS · LOWER BODY',type:'lower',cycleDay:null,isCore:false,isRest:false,
   exercises:[
    {id:'d1',name:'Barbell Back Squat',target:'Quads/Glutes',sets:4,reps:'6–8',tags:['priority'],note:'King of lower body. Break parallel every rep.'},
    {id:'d2',name:'Leg Press',target:'Quads/Glutes',sets:4,reps:'10–12',tags:[],note:'After squats, go heavy. Push through heels.'},
    {id:'d3',name:'Romanian Deadlift',target:'Hamstrings/Back',sets:4,reps:'8–10',tags:['priority'],note:'Most underrated leg exercise. Feel the stretch.'},
    {id:'d4',name:'Lying Leg Curl',target:'Hamstrings',sets:3,reps:'10–12',tags:[],note:'Fully exhaust hamstrings after RDL.'},
    {id:'d5',name:'Glute Kickback (Cable)',target:'Glutes',sets:3,reps:'12 ea',tags:[],note:'Cable keeps tension throughout.'},
    {id:'d6',name:'Standing Calf Raise',target:'Calves',sets:4,reps:'15–20',tags:[],note:'2 sec pause at bottom. Calves respond to stretch.'},
    {id:'d7',name:'Hanging Leg Raises',target:'Abs/Core',sets:3,reps:'15',tags:[],note:'Use core to initiate, not momentum.'},
   ],cardio:{name:'Power Incline Walk',detail:'15% incline · Quad & glute burn finisher',dur:"10'"}}
];

