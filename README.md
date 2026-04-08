---
title: CARE DEM
emoji: 🏥
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# 🏥 CARE DEM — Dementia Care AI Environment

A fully dynamic OpenEnv-compatible environment for dementia care AI agents.
The caretaker configures every patient detail (medicines, family, routine) via dashboard — **nothing is hardcoded**.

---

## Files

| File | Purpose |
|---|---|
| `main.py` | FastAPI server — the environment (run this on HuggingFace) |
| `dashboard.py` | CLI dashboard — caretaker inputs patient data locally |
| `inference.py` | Inference script — runs the AI agent against all 6 tasks |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | Container config for HuggingFace Spaces |

---

## 6 Tasks

| Task | Difficulty |
|---|---|
| medication_reminder | Easy |
| daily_routine | Medium |
| memory_prompts | Medium-Hard |
| safety_and_care | Hard |
| vital_monitoring | Medium |
| voice_memory_care | Medium-Hard |

---

## How to Run (Local)

### Step 1 — Install dependencies
```bash
pip install -r requirements.txt
```

### Step 2 — Start the server
```bash
uvicorn main:app --host 0.0.0.0 --port 7860
```

### Step 3 — Configure the patient (new terminal)
```bash
python dashboard.py
```
In the dashboard:
- Option **1** — Set patient & caregiver names
- Option **2** — Add medicines (name, dose, schedule) — repeat for each medicine
- Option **5** — Add family members
- Option **6** — Add emergency contacts
- Option **7** — Set daily routine
- Option **11** — Send config to server ✅

### Step 4 — Run inference (new terminal)
```bash
# Set environment variables first:
# Linux/Mac:
export HF_TOKEN="your_groq_api_key"
export MODEL_NAME="llama3-8b-8192"
export API_BASE_URL="https://api.groq.com/openai/v1"
export ENV_URL="http://localhost:7860"

# Windows PowerShell:
$env:HF_TOKEN="your_groq_api_key"
$env:MODEL_NAME="llama3-8b-8192"
$env:API_BASE_URL="https://api.groq.com/openai/v1"
$env:ENV_URL="http://localhost:7860"

python inference.py
```

---

## How to Deploy on HuggingFace Spaces

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) → **Create new Space**
2. Choose **Docker** as the SDK
3. Upload these files:
   - `main.py`
   - `requirements.txt`
   - `Dockerfile`
4. The Space will build and start automatically
5. Your server URL will be: `https://YOUR_USERNAME-care-dem.hf.space`

Then run dashboard + inference **locally**, pointing to your Space URL:
```bash
# In dashboard.py, change server_url:
dashboard = CaretakerDashboard(server_url="https://YOUR_USERNAME-care-dem.hf.space")

# Or set ENV_URL for inference:
export ENV_URL="https://YOUR_USERNAME-care-dem.hf.space"
python inference.py
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Server status + setup instructions |
| GET | `/tasks` | List all 6 tasks |
| POST | `/caretaker-setup` | Configure patient (call before /reset) |
| GET | `/caretaker-status` | View current patient config |
| POST | `/reset` | Start a new episode |
| POST | `/step` | Submit an action, get reward |
| GET | `/state` | Current episode progress |

### Example: Configure patient
```bash
curl -X POST http://localhost:7860/caretaker-setup \
  -H "Content-Type: application/json" \
  -d '{
    "patient_name": "Ravi",
    "caregiver_name": "Nurse Meena",
    "custom_medications": [
      {"name": "Aspirin", "dose": "500mg", "schedule": "09:00 AM", "colour": "white tablet"},
      {"name": "Vitamin D", "dose": "1000IU", "schedule": "02:00 PM", "colour": "yellow capsule"}
    ],
    "family": {"Priya": "daughter (Saturdays)", "Arjun": "son (Tuesdays)"},
    "emergency_contacts": [
      {"name": "Priya", "relation": "daughter", "phone": "98765-00001"},
      {"name": "Dr. Sharma", "relation": "doctor", "phone": "98765-00002"}
    ],
    "routine": ["wake up", "take medication", "have breakfast", "read newspaper", "call Priya"],
    "places": ["balcony garden", "favourite chair"],
    "events": ["Diwali last week", "doctor visit Monday"]
  }'
```

---

## Important Notes

- **`/reset` and `/step` will return HTTP 400** until `/caretaker-setup` is called. This is intentional — the system refuses to run with no patient configured.
- The server **must be running** before you run `dashboard.py` or `inference.py`.
- Run `dashboard.py` every time you want to configure a new patient.
