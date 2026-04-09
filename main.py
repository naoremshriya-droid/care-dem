"""
main.py — CARE DEM OpenEnv Environment Server
All 6 tasks:
  1. medication_reminder  (easy)
  2. daily_routine        (medium)
  3. memory_prompts       (medium-hard)
  4. safety_and_care      (hard)
  5. vital_monitoring     (medium)
  6. voice_memory_care    (medium-hard)

Run with: uvicorn main:app --host 0.0.0.0 --port 7860
"""

from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="CARE DEM OpenEnv", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class Action(BaseModel):
    action_type: str
    message:     str
    target:      Optional[str] = None
    urgency:     Optional[str] = "normal"

class MedicationItem(BaseModel):
    name:     str
    dose:     str
    schedule: str
    colour:   Optional[str] = "white tablet"
    notes:    Optional[str] = ""

class CaretakerSetup(BaseModel):
    task_id:            Optional[str] = "medication_reminder"
    patient_name:       str
    caregiver_name:     str
    custom_medications: list[MedicationItem]
    family:             Optional[dict] = {}
    emergency_contacts: Optional[list] = []
    routine:            Optional[list] = []
    places:             Optional[list] = []
    events:             Optional[list] = []

# ─────────────────────────────────────────────────────────────
# Global Patient Config — NO hardcoded defaults
# Must be set via POST /caretaker-setup before any /reset call
# ─────────────────────────────────────────────────────────────

PATIENT_CFG: Optional[CaretakerSetup] = None

def require_config():
    if PATIENT_CFG is None:
        raise HTTPException(
            status_code=400,
            detail="No patient configured. Run dashboard.py first and use option 5 to send config."
        )

# ─────────────────────────────────────────────────────────────
# Tasks
# ─────────────────────────────────────────────────────────────

TASKS = [
    {"task_id": "medication_reminder", "name": "Medication Reminder & Tracking",         "difficulty": "easy",        "max_steps": 5},
    {"task_id": "daily_routine",       "name": "Daily Schedule & Routine Guidance",       "difficulty": "medium",      "max_steps": 10},
    {"task_id": "memory_prompts",      "name": "Memory Prompts — People, Places & Events","difficulty": "medium-hard", "max_steps": 8},
    {"task_id": "safety_and_care",     "name": "Safety Alert & Compound Care",            "difficulty": "hard",        "max_steps": 10},
    {"task_id": "vital_monitoring",    "name": "Vital Signs Monitoring & Emergency Response","difficulty": "medium",   "max_steps": 8},
    {"task_id": "voice_memory_care",   "name": "Voice Memory Care & Family Reminders",    "difficulty": "medium-hard", "max_steps": 8},
]
TASK_MAP = {t["task_id"]: t for t in TASKS}

# ─────────────────────────────────────────────────────────────
# Episode State
# ─────────────────────────────────────────────────────────────

class EpisodeState:
    def __init__(self):
        self.task_id           = ""
        self.step              = 0
        self.done              = False
        self.total_reward      = 0.0
        self.history           = []
        self.context           = {}
        self.med_mentioned     = False
        self.med_confirmed     = False
        self.routine_steps     = []
        self.memory_person     = False
        self.memory_place      = False
        self.memory_event      = False
        self.stove_done        = False
        self.door_done         = False
        self.visitor_done      = False
        self.reassure_done     = False
        self.log_done          = False
        self.vitals_informed   = False
        self.breathing_guided  = False
        self.emergency_alerted = False
        self.vitals_logged     = False
        self.voice_notified    = False
        self.voice_played      = False
        self.voice_confirmed   = False
        self.voice_logged      = False

STATE = EpisodeState()

# ─────────────────────────────────────────────────────────────
# Dynamic keyword helpers
# ─────────────────────────────────────────────────────────────

def has(text, words):
    t = text.lower()
    return any(w.lower() in t for w in words)

def med_keywords(cfg):
    words = ["tablet", "pill", "medicine", "medication", "capsule", "dose", "drug"]
    for m in cfg.custom_medications:
        words.append(m.name.lower())
        words.append(m.dose.lower())
        if m.colour: words.append(m.colour.lower())
    return words

def family_keywords(cfg):
    words = []
    for name, rel in (cfg.family or {}).items():
        words.append(name.lower())
        for r in ["daughter", "son", "wife", "husband", "sister", "brother", "nephew", "niece"]:
            if r in rel.lower():
                words.append(r)
    return words or ["family", "relative"]

# ─────────────────────────────────────────────────────────────
# Graders — all dynamic
# ─────────────────────────────────────────────────────────────

def grade_medication(action, state):
    cfg = PATIENT_CFG
    score = 0.0; credits = {}
    msg = (action.message + " " + (action.target or "")).lower()

    if action.action_type in ("remind", "answer", "guide", "reassure"):
        score += 0.20; credits["action_type"] = 0.20

    if has(msg, med_keywords(cfg)):
        score += 0.25; credits["med_mentioned"] = 0.25
        state.med_mentioned = True

    morning_meds = [m for m in cfg.custom_medications
                    if any(k in m.schedule.lower() for k in ["morning", "am", "08", "09"])]
    dose_words = [m.dose.lower() for m in morning_meds] + ["morning", "now", "today", "dose"]
    if has(msg, dose_words):
        score += 0.20; credits["dose_timing"] = 0.20

    if has(msg, ["have you", "did you", "taken", "confirm", "let me know",
                 "okay?", "done", "already", "check", "tell me"]):
        score += 0.20; credits["confirmation"] = 0.20
        state.med_confirmed = True

    if has(msg, ["note", "log", "record", "caregiver", "nurse", "family",
                 "inform", "update", "track", "written", cfg.caregiver_name.lower()]):
        score += 0.15; credits["logged"] = 0.15

    return min(score, 1.0), credits


def grade_routine(action, state):
    cfg = PATIENT_CFG
    score = 0.0; credits = {}
    msg = action.message.lower()

    routine_keyword_groups = [
        ["wake", "sit up", "morning", "get up", "rise", "awake"],
        ["brush", "teeth", "dental", "bathroom", "wash"],
        ["medication", "tablet", "pill", "medicine"] + [m.name.lower() for m in cfg.custom_medications],
        ["breakfast", "eat", "food", "cereal", "meal", "toast"],
        list((cfg.family or {}).keys()) + ["call", "phone", "family", "daughter", "son", "ring"],
    ]

    next_idx = len(state.routine_steps)
    if next_idx < len(routine_keyword_groups):
        if has(msg, routine_keyword_groups[next_idx]):
            label = (cfg.routine[next_idx] if cfg.routine and next_idx < len(cfg.routine)
                     else f"step_{next_idx + 1}")
            state.routine_steps.append(label)
            score += 0.40; credits[f"step_{next_idx}"] = 0.40

    if has(msg, ["let's", "slowly", "time", "ready", "great", "well done",
                 "together", "no rush", "wonderful", "gently", "i'm here"]):
        score += 0.30; credits["friendly"] = 0.30

    if action.action_type in ("guide", "remind", "reassure", "answer"):
        score += 0.10; credits["action_type"] = 0.10

    if len(state.routine_steps) >= 5:
        score = min(score + 0.20, 1.0); credits["all_complete"] = 0.20

    return min(score, 1.0), credits


def grade_memory(action, state):
    cfg = PATIENT_CFG
    score = 0.0; credits = {}
    msg = action.message.lower()

    if has(msg, family_keywords(cfg) + ["neighbour", "doctor", "visited", "came to see"]):
        score += 0.25; credits["person"] = 0.25
        state.memory_person = True

    if has(msg, [p.lower() for p in (cfg.places or [])] + ["favourite", "sit", "park", "home", "outside"]):
        score += 0.25; credits["place"] = 0.25
        state.memory_place = True

    if has(msg, [e.lower() for e in (cfg.events or [])] + ["birthday", "party", "visit", "recently", "last week"]):
        score += 0.25; credits["event"] = 0.25
        state.memory_event = True

    if has(msg, ["photo", "picture", "album", "note", "card", "written",
                 "remember", "recall", "hint", "think back"]):
        score += 0.25; credits["cue_used"] = 0.25

    return min(score, 1.0), credits


def grade_safety(action, state):
    cfg = PATIENT_CFG
    score = 0.0; credits = {}
    msg = action.message.lower()

    if has(msg, ["stove", "oven", "kitchen", "burner", "turn off",
                 "switch off", "fire", "heat", "gas"]):
        state.stove_done = True; score += 0.25; credits["stove"] = 0.25

    if has(msg, ["door", "lock", "front", "entrance", "closed", "shut", "bolt", "secure"]):
        state.door_done = True; score += 0.20; credits["door"] = 0.20

    if has(msg, family_keywords(cfg) + ["visitor", "she", "visited", "came"]):
        state.visitor_done = True; score += 0.20; credits["visitor"] = 0.20

    if has(msg, ["safe", "okay", "fine", "don't worry", "no worries",
                 "calm", "here with you", "i'm here", "not your fault"]):
        state.reassure_done = True; score += 0.20; credits["reassured"] = 0.20

    if has(msg, ["log", "note", "caregiver", "nurse", "record",
                 "inform", "notify", "family", "report", cfg.caregiver_name.lower()]):
        state.log_done = True; score += 0.15; credits["logged"] = 0.15

    return min(score, 1.0), credits


def grade_vitals(action, state):
    cfg = PATIENT_CFG
    score = 0.0; credits = {}
    msg = action.message.lower()

    if has(msg, ["heart rate", "heartbeat", "pulse", "bpm", "breathing",
                 "breath", "vitals", "reading", "monitor", "detected"]):
        state.vitals_informed = True; score += 0.25; credits["vitals_informed"] = 0.25

    if has(msg, ["breathe", "sit down", "sit", "slowly", "deep breath",
                 "inhale", "exhale", "calm", "relax", "in and out", "take a breath"]):
        state.breathing_guided = True; score += 0.25; credits["breathing_guided"] = 0.25

    ec_names = [c["name"].lower() for c in (cfg.emergency_contacts or [])]
    if has(msg, ec_names + ["emergency", "contact", "alert", "notify",
                            "doctor", "nurse", "ambulance", "help", "family"]):
        state.emergency_alerted = True; score += 0.25; credits["emergency_alerted"] = 0.25

    if has(msg, ["log", "record", "note", "doctor", "report", "timestamp",
                 "written", "saved", "caregiver", "medical", "history"]):
        state.vitals_logged = True; score += 0.25; credits["vitals_logged"] = 0.25

    return min(score, 1.0), credits


def grade_voice(action, state):
    cfg = PATIENT_CFG
    score = 0.0; credits = {}
    msg = action.message.lower()

    if has(msg, family_keywords(cfg) + ["voice", "message", "recording",
                                        "audio", "left a message", "sent you"]):
        state.voice_notified = True; score += 0.25; credits["voice_notified"] = 0.25

    if has(msg, med_keywords(cfg) + ["play", "playing", "listen", "hear",
                                     "reminder", "here it is", "message says"]):
        state.voice_played = True; score += 0.25; credits["voice_played"] = 0.25

    if has(msg, ["did you hear", "understood", "clear", "make sense",
                 "got that", "okay?", "confirm", "replay", "once more"]):
        state.voice_confirmed = True; score += 0.25; credits["voice_confirmed"] = 0.25

    if has(msg, ["log", "noted", "recorded", "delivered", "caregiver",
                 "app", "confirmed", "marked", "saved", "informed"]):
        state.voice_logged = True; score += 0.25; credits["voice_logged"] = 0.25

    return min(score, 1.0), credits


GRADERS = {
    "medication_reminder": grade_medication,
    "daily_routine":       grade_routine,
    "memory_prompts":      grade_memory,
    "safety_and_care":     grade_safety,
    "vital_monitoring":    grade_vitals,
    "voice_memory_care":   grade_voice,
}

# ─────────────────────────────────────────────────────────────
# Observations — fully dynamic
# ─────────────────────────────────────────────────────────────

def make_obs(task_id):
    cfg  = PATIENT_CFG
    base = {"task_id": task_id, "step": 0}
    name = cfg.patient_name

    if task_id == "medication_reminder":
        morning_meds = [m for m in cfg.custom_medications
                        if any(k in m.schedule.lower() for k in ["morning", "am", "08", "09"])]
        med_hint = f"{morning_meds[0].name} {morning_meds[0].dose}" if morning_meds else f"{cfg.custom_medications[0].name} {cfg.custom_medications[0].dose}"
        return {**base,
            "patient_message": "I don't think I took my tablet this morning. Did I?",
            "context": {
                "time_of_day": "morning", "patient_name": name,
                "medications": [m.model_dump() for m in cfg.custom_medications],
                "caregiver": cfg.caregiver_name,
            },
            "alerts": [], "time_of_day": "morning", "patient_mood": "confused",
            "memory_cues": ["Medication box is on the counter", f"Morning tablet: {med_hint}"],
        }

    elif task_id == "daily_routine":
        routine = cfg.routine if cfg.routine else ["wake up", "brush teeth", "take medication", "have breakfast", "call family"]
        return {**base,
            "patient_message": "Good morning. I just woke up. What do I do now?",
            "context": {"time_of_day": "morning", "patient_name": name, "routine": routine},
            "alerts": [], "time_of_day": "morning", "patient_mood": "calm",
            "memory_cues": ["Routine chart is on the wall", "Phone is on the bedside table"],
        }

    elif task_id == "memory_prompts":
        family     = cfg.family or {}
        first_name = next(iter(family), "a family member")
        first_rel  = family.get(first_name, "family")
        return {**base,
            "patient_message": "Someone visited me recently. And where do I like to sit?",
            "context": {
                "time_of_day": "afternoon", "patient_name": name,
                "family": family, "places": cfg.places or [], "events": cfg.events or [],
            },
            "alerts": [], "time_of_day": "afternoon", "patient_mood": "confused",
            "memory_cues": ["Photo album on coffee table", f"Note on fridge: {first_name} — {first_rel}"],
        }

    elif task_id == "safety_and_care":
        family      = cfg.family or {}
        first_name  = next(iter(family), "a family member")
        visitor_log = [f"{first_name} visited 2-3 PM"]
        return {**base,
            "patient_message": "I made some tea earlier. And someone visited — I can't remember who.",
            "context": {
                "time_of_day": "afternoon", "patient_name": name,
                "sensors": {"stove": "ON 47 minutes", "front_door": "UNLOCKED"},
                "visitor_log": visitor_log, "caregiver": cfg.caregiver_name,
            },
            "alerts": ["EMERGENCY: Kitchen stove ON for 47 minutes!", "WARNING: Front door is unlocked"],
            "time_of_day": "afternoon", "patient_mood": "confused",
            "memory_cues": [f"Visitor log: {visitor_log[0]}"],
        }

    elif task_id == "vital_monitoring":
        return {**base,
            "patient_message": "I feel a little strange. My chest feels odd and I'm breathing fast.",
            "context": {
                "time_of_day": "afternoon", "patient_name": name,
                "vitals": {
                    "heart_rate":    "112 bpm (normal: 60-100) — HIGH",
                    "breathing_rate": "22 breaths/min (normal: 12-20) — ELEVATED",
                    "oxygen_level":  "96% — normal",
                    "temperature":   "37.2°C — normal",
                },
                "emergency_contacts": cfg.emergency_contacts or [],
                "watch_model": "CARE DEM SmartWatch v1",
            },
            "alerts": [
                "HEALTH ALERT: Heart rate 112 bpm — above normal range",
                "HEALTH ALERT: Breathing rate elevated — 22 breaths/min",
            ],
            "time_of_day": "afternoon", "patient_mood": "anxious",
            "memory_cues": ["Smartwatch shows live heart rate", "Emergency contacts saved in app"],
        }

    elif task_id == "voice_memory_care":
        family      = cfg.family or {}
        names       = list(family.keys())
        first_name  = names[0] if names else "family"
        second_name = names[1] if len(names) > 1 else first_name
        first_rel   = family.get(first_name, "family")
        second_rel  = family.get(second_name, "family")
        morning_meds = [m for m in cfg.custom_medications
                        if any(k in m.schedule.lower() for k in ["morning", "am", "08", "09"])]
        med_name = morning_meds[0].name if morning_meds else cfg.custom_medications[0].name
        return {**base,
            "patient_message": "Did someone leave me a message? I thought I heard something...",
            "context": {
                "time_of_day": "morning", "patient_name": name,
                "voice_messages": [
                    {
                        "from": f"{first_name} ({first_rel})",
                        "recorded_at": "7:00 AM today",
                        "content": f"Good morning! Please remember to take your {med_name}. Love you!",
                        "type": "medication_reminder",
                    },
                    {
                        "from": f"{second_name} ({second_rel})",
                        "recorded_at": "yesterday",
                        "content": "Don't forget our call. Love you!",
                        "type": "schedule_reminder",
                    },
                ],
                "scheduled_reminders": [
                    {"time": "8:00 AM",  "type": "medication", "voice_from": first_name},
                    {"time": "12:00 PM", "type": "lunch",      "voice_from": second_name},
                ],
                "caregiver_app": "CARE DEM App v1.0",
            },
            "alerts": [f"Voice reminder from {first_name} ready to play — medication reminder"],
            "time_of_day": "morning", "patient_mood": "calm",
            "memory_cues": [f"{first_name} recorded a voice message at 7 AM",
                            f"Voice message: take {med_name}"],
        }

# ─────────────────────────────────────────────────────────────
# Follow-up messages (generic, no hardcoded names)
# ─────────────────────────────────────────────────────────────

FOLLOWUPS = {
    "medication_reminder": [
        "The tablet? Where is it kept again?",
        "I found the box. Should I take it now with water?",
        "I took it. Did I do the right thing?",
        "Thank you. Should I tell someone I took it?",
    ],
    "daily_routine": [
        "Okay I am sitting up. What comes next?",
        "I brushed my teeth. Now what?",
        "I took the tablet with water. What is after this?",
        "I had some breakfast. What do I do now?",
        "I made the call! Did I finish everything?",
    ],
    "memory_prompts": [
        "Yes... someone from my family? They came recently?",
        "Oh yes I love sitting there. Did something happen last week?",
        "A celebration? Who was there with me?",
        "Yes... I remember now. That was a lovely time.",
    ],
    "safety_and_care": [
        "The stove? Oh no I forgot completely! Is there a fire?",
        "I turned it off. I'm sorry. Was the door unlocked too?",
        "I locked the door. Who was the visitor?",
        "I feel silly about this. Does the caregiver need to know?",
        "Thank you for helping me.",
    ],
    "vital_monitoring": [
        "My heart is beating fast? Is that bad?",
        "Okay I am sitting down. Should I breathe slowly now?",
        "I am breathing slowly... in and out. Is my heart better now?",
        "Is someone coming? I don't want to worry them.",
        "Please tell the doctor. Will you write it down?",
    ],
    "voice_memory_care": [
        "Oh a message? Can I hear it now please?",
        "That was their voice! They said to take my tablet yes?",
        "I heard it. Did they record that for me?",
        "Can you play it again? I want to hear it once more.",
        "Thank you. Please tell them I listened.",
    ],
}

def next_obs(task_id, step):
    msgs   = FOLLOWUPS.get(task_id, ["I am not sure what to do."])
    msg    = msgs[min(step - 1, len(msgs) - 1)]
    alerts = []
    if task_id == "safety_and_care":
        if step < 2: alerts = ["EMERGENCY: Stove still ON!"]
        elif step < 3: alerts = ["WARNING: Door still unlocked"]
    elif task_id == "vital_monitoring":
        if step < 3: alerts = ["HEALTH ALERT: Heart rate still elevated — 108 bpm"]
    elif task_id == "voice_memory_care":
        if step == 1: alerts = ["Voice reminder ready to play"]

    return {
        "task_id": task_id, "step": step,
        "patient_message": msg,
        "context": STATE.context,
        "alerts": alerts,
        "time_of_day": STATE.context.get("time_of_day", "morning"),
        "patient_mood": "calm" if step > 2 else "confused",
        "memory_cues": STATE.context.get("_cues", []),
    }

# ─────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/")
def root():
    configured = PATIENT_CFG is not None
    return {
        "name": "CARE DEM OpenEnv",
        "version": "1.0.0",
        "status": "running",
        "tasks": list(TASK_MAP.keys()),
        "total_tasks": len(TASK_MAP),
        "caretaker_medicines_set": configured,
        "patient_name": PATIENT_CFG.patient_name if configured else None,
        "setup_required": not configured,
        "setup_instructions": "POST /caretaker-setup with patient details before calling /reset",
    }

@app.get("/tasks")
def get_tasks():
    return {"tasks": TASKS}

@app.get("/caretaker-status")
def caretaker_status():
    if PATIENT_CFG is None:
        return {"configured": False, "message": "No patient configured. Run dashboard.py first."}
    return {
        "configured": True,
        "patient_name": PATIENT_CFG.patient_name,
        "caregiver_name": PATIENT_CFG.caregiver_name,
        "medications": [m.model_dump() for m in PATIENT_CFG.custom_medications],
        "family": PATIENT_CFG.family,
        "emergency_contacts": PATIENT_CFG.emergency_contacts,
        "routine": PATIENT_CFG.routine,
        "places": PATIENT_CFG.places,
        "events": PATIENT_CFG.events,
    }

@app.post("/caretaker-setup")
def caretaker_setup(config: CaretakerSetup):
    """Called by dashboard.py to configure the patient. Must be called before /reset."""
    global PATIENT_CFG
    PATIENT_CFG = config
    return {
        "status": "ok",
        "message": f"Patient '{config.patient_name}' configured with {len(config.custom_medications)} medicine(s). Ready to /reset.",
        "patient_name": config.patient_name,
        "caregiver_name": config.caregiver_name,
        "medicines_configured": len(config.custom_medications),
        "medicines": [m.model_dump() for m in config.custom_medications],
    }

@app.post("/reset")
def reset(body: dict = None):
    global STATE, PATIENT_CFG

    class DummyConfig:
        def __init__(self):
            self.patient_name = "Test Patient"
            self.caregiver_name = "Test Caregiver"
            self.custom_medications = []
            self.family = {}
            self.emergency_contacts = []
            self.routine = []
            self.places = []
            self.events = []

    if PATIENT_CFG is None:
        PATIENT_CFG = DummyConfig()
  
    task_id = (body or {}).get("task_id", "medication_reminder")
    if task_id not in TASK_MAP:
        return {"error": f"Unknown task '{task_id}'. Valid: {list(TASK_MAP.keys())}"}
    STATE = EpisodeState()
    STATE.task_id = task_id
    obs = make_obs(task_id)
    STATE.context = obs.get("context", {})
    STATE.context["time_of_day"] = obs.get("time_of_day", "morning")
    STATE.context["_cues"] = obs.get("memory_cues", [])
    return {"observation": obs, "task": TASK_MAP[task_id]}

@app.post("/step")
def step(action_data: dict):
    global STATE
    require_config()
    if not STATE.task_id:
        return {"error": "Call /reset first."}
    STATE.step += 1

    try:
        action = Action(**action_data)
    except Exception:
        action = Action(action_type="no_op", message="")

    reward, credits = GRADERS[STATE.task_id](action, STATE)
    STATE.total_reward += reward
    STATE.history.append({"step": STATE.step, "reward": reward})

    done = False
    if STATE.task_id == "medication_reminder":
        done = STATE.med_mentioned and STATE.med_confirmed
    elif STATE.task_id == "daily_routine":
        done = len(STATE.routine_steps) >= 5
    elif STATE.task_id == "memory_prompts":
        done = sum([STATE.memory_person, STATE.memory_place, STATE.memory_event]) >= 2
    elif STATE.task_id == "safety_and_care":
        done = STATE.stove_done and STATE.door_done and STATE.reassure_done
    elif STATE.task_id == "vital_monitoring":
        done = STATE.vitals_informed and STATE.breathing_guided and STATE.vitals_logged
    elif STATE.task_id == "voice_memory_care":
        done = STATE.voice_notified and STATE.voice_played and STATE.voice_confirmed

    if STATE.step >= TASK_MAP[STATE.task_id]["max_steps"]:
        done = True
    STATE.done = done

    obs = (
        {"task_id": STATE.task_id, "step": STATE.step,
         "patient_message": "Thank you so much. I feel much better now.",
         "context": STATE.context, "alerts": [],
         "time_of_day": STATE.context.get("time_of_day", "morning"),
         "patient_mood": "calm", "memory_cues": []}
        if done else next_obs(STATE.task_id, STATE.step)
    )

    return {
        "observation": obs, "reward": reward, "done": done,
        "info": {
            "partial_credits": credits,
            "total_reward_so_far": STATE.total_reward,
            "step": STATE.step, "task_id": STATE.task_id,
        },
    }

@app.get("/state")
def get_state():
    return {
        "task_id": STATE.task_id, "step": STATE.step,
        "done": STATE.done, "total_reward": STATE.total_reward,
        "progress": {
            "med_mentioned":     STATE.med_mentioned,
            "med_confirmed":     STATE.med_confirmed,
            "routine_steps":     STATE.routine_steps,
            "memory_person":     STATE.memory_person,
            "memory_place":      STATE.memory_place,
            "stove_done":        STATE.stove_done,
            "door_done":         STATE.door_done,
            "vitals_informed":   STATE.vitals_informed,
            "breathing_guided":  STATE.breathing_guided,
            "emergency_alerted": STATE.emergency_alerted,
            "vitals_logged":     STATE.vitals_logged,
            "voice_notified":    STATE.voice_notified,
            "voice_played":      STATE.voice_played,
            "voice_confirmed":   STATE.voice_confirmed,
            "voice_logged":      STATE.voice_logged,
        },
    }
