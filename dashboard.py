"""
dashboard.py — Caretaker Dashboard for CARE DEM
Run this FIRST to configure the patient before running inference.py

The caregiver inputs:
  - Patient & caregiver names
  - Medicines (name, dose, schedule, colour, notes)
  - Family members & relations
  - Emergency contacts
  - Daily routine steps
  - Favourite places & recent events
"""

import requests
import json
from typing import List


class MedicineEntry:
    def __init__(self, name, dose, schedule, colour="white tablet", notes=""):
        self.name     = name
        self.dose     = dose
        self.schedule = schedule
        self.colour   = colour
        self.notes    = notes

    def to_dict(self):
        return {
            "name":     self.name,
            "dose":     self.dose,
            "schedule": self.schedule,
            "colour":   self.colour,
            "notes":    self.notes,
        }


class CaretakerDashboard:
    def __init__(self, server_url="http://localhost:7860"):
        self.server_url        = server_url
        self.medicines: List[MedicineEntry] = []
        self.patient_name      = ""
        self.caregiver_name    = ""
        self.family            = {}   # {"Sarah": "daughter (Sundays)"}
        self.emergency_contacts = []  # [{"name": "Sarah", "relation": "daughter", "phone": "..."}]
        self.routine           = []   # ["wake up", "brush teeth", ...]
        self.places            = []   # ["garden", "armchair by window"]
        self.events            = []   # ["birthday party last Saturday"]

    # ─────────────────────────────────────────────────────────
    # Display helpers
    # ─────────────────────────────────────────────────────────

    def banner(self):
        print("\n" + "=" * 70)
        print("  DEMENTIA CARE — CARETAKER CONFIGURATION DASHBOARD")
        print("=" * 70)
        print("  Configure the patient ONCE before running inference.py")
        print("  All fields feed directly into the AI — nothing is hardcoded.\n")

    def menu(self):
        configured = bool(self.patient_name and self.medicines)
        status = "✅ Ready to send" if configured else "⚠️  Incomplete — set names + medicines first"
        print("\n" + "-" * 70)
        print(f"  Patient : {self.patient_name or '(not set)'}")
        print(f"  Status  : {status}")
        print("-" * 70)
        print("  1.  Set patient & caregiver names")
        print("  2.  Add medicine")
        print("  3.  View medicines")
        print("  4.  Remove medicine")
        print("  5.  Add family member")
        print("  6.  Add emergency contact")
        print("  7.  Set daily routine")
        print("  8.  Set favourite places")
        print("  9.  Set recent events")
        print("  10. Preview full config")
        print("  11. Send to server  ← do this before inference.py")
        print("  12. Check server status")
        print("  0.  Exit")
        print("-" * 70)

    # ─────────────────────────────────────────────────────────
    # Input methods
    # ─────────────────────────────────────────────────────────

    def set_names(self):
        print("\n=== PATIENT & CAREGIVER NAMES ===")
        p = input(f"Patient name (current: '{self.patient_name}'): ").strip()
        if p: self.patient_name = p
        c = input(f"Caregiver name (current: '{self.caregiver_name}'): ").strip()
        if c: self.caregiver_name = c
        print(f"\n✅ Patient: {self.patient_name} | Caregiver: {self.caregiver_name}")

    def add_medicine(self):
        print("\n=== ADD MEDICINE ===")
        print("Examples — Name: Aspirin | Dose: 500mg | Schedule: 09:00 AM or morning")
        name = input("Medicine name: ").strip()
        if not name: print("❌ Name required."); return
        dose = input("Dose (e.g. 500mg): ").strip()
        if not dose: print("❌ Dose required."); return
        schedule = input("Schedule (e.g. 09:00 AM / morning / evening): ").strip()
        if not schedule: print("❌ Schedule required."); return
        colour = input("Colour/description (Enter to skip → 'white tablet'): ").strip() or "white tablet"
        notes  = input("Notes (Enter to skip): ").strip()
        self.medicines.append(MedicineEntry(name, dose, schedule, colour, notes))
        print(f"\n✅ Added: {name} {dose} at {schedule}")

    def view_medicines(self):
        print("\n=== MEDICINES ===")
        if not self.medicines:
            print("  (none added yet)"); return
        for i, m in enumerate(self.medicines, 1):
            print(f"  {i}. {m.name} — {m.dose} — {m.schedule} — {m.colour}")
            if m.notes: print(f"     Notes: {m.notes}")
        print(f"\n  Total: {len(self.medicines)}")

    def remove_medicine(self):
        self.view_medicines()
        if not self.medicines: return
        try:
            idx = int(input("Enter number to remove (0 to cancel): "))
            if idx == 0: return
            if 1 <= idx <= len(self.medicines):
                removed = self.medicines.pop(idx - 1)
                print(f"✅ Removed: {removed.name}")
            else:
                print("❌ Invalid number.")
        except ValueError:
            print("❌ Enter a valid number.")

    def add_family_member(self):
        print("\n=== ADD FAMILY MEMBER ===")
        print("Example — Name: Sarah | Relation: daughter (Sundays)")
        name = input("Name: ").strip()
        if not name: print("❌ Name required."); return
        rel  = input("Relation/description (e.g. daughter (Sundays)): ").strip()
        if not rel: rel = "family"
        self.family[name] = rel
        print(f"✅ Added: {name} — {rel}")
        print(f"   Family so far: {self.family}")

    def add_emergency_contact(self):
        print("\n=== ADD EMERGENCY CONTACT ===")
        name     = input("Name: ").strip()
        if not name: print("❌ Name required."); return
        relation = input("Relation (e.g. daughter / doctor): ").strip() or "family"
        phone    = input("Phone number: ").strip() or "N/A"
        self.emergency_contacts.append({"name": name, "relation": relation, "phone": phone})
        print(f"✅ Added: {name} ({relation}) — {phone}")

    def set_routine(self):
        print("\n=== DAILY ROUTINE ===")
        print("Enter steps one per line. Press Enter on blank line to finish.")
        print("Example: wake up | brush teeth | take medication | have breakfast | call family")
        steps = []
        while True:
            step = input(f"  Step {len(steps)+1}: ").strip()
            if not step: break
            steps.append(step)
        if steps:
            self.routine = steps
            print(f"✅ Routine set: {' → '.join(steps)}")
        else:
            print("  (routine unchanged)")

    def set_places(self):
        print("\n=== FAVOURITE PLACES ===")
        print("Enter places one per line. Press Enter on blank line to finish.")
        places = []
        while True:
            p = input(f"  Place {len(places)+1}: ").strip()
            if not p: break
            places.append(p)
        if places:
            self.places = places
            print(f"✅ Places: {', '.join(places)}")

    def set_events(self):
        print("\n=== RECENT EVENTS ===")
        print("Enter recent events one per line. Press Enter on blank line to finish.")
        print("Example: birthday party last Saturday | doctor visit last Monday")
        events = []
        while True:
            e = input(f"  Event {len(events)+1}: ").strip()
            if not e: break
            events.append(e)
        if events:
            self.events = events
            print(f"✅ Events: {', '.join(events)}")

    def preview_config(self):
        print("\n=== FULL CONFIGURATION PREVIEW ===")
        cfg = self._build_payload()
        print(json.dumps(cfg, indent=2))

    def _build_payload(self):
        return {
            "patient_name":       self.patient_name,
            "caregiver_name":     self.caregiver_name,
            "custom_medications": [m.to_dict() for m in self.medicines],
            "family":             self.family,
            "emergency_contacts": self.emergency_contacts,
            "routine":            self.routine,
            "places":             self.places,
            "events":             self.events,
        }

    def send_to_server(self):
        print("\n=== SEND TO SERVER ===")
        if not self.patient_name:
            print("❌ Set patient name first (option 1)."); return
        if not self.caregiver_name:
            print("❌ Set caregiver name first (option 1)."); return
        if not self.medicines:
            print("❌ Add at least one medicine first (option 2)."); return

        payload = self._build_payload()

        print(f"\nSending to {self.server_url}/caretaker-setup ...")
        print(f"  Patient   : {self.patient_name}")
        print(f"  Caregiver : {self.caregiver_name}")
        print(f"  Medicines : {len(self.medicines)}")

        try:
            response = requests.post(
                f"{self.server_url}/caretaker-setup",
                json=payload,
                timeout=10,
            )
            if response.status_code == 200:
                data = response.json()
                print(f"\n✅ SUCCESS — {data.get('message')}")
                print("\n  Medicines the AI will use:")
                for m in self.medicines:
                    print(f"    • {m.name} ({m.dose}) at {m.schedule}")
                print("\n✅ Now run: python inference.py")
            else:
                print(f"\n❌ Server error {response.status_code}: {response.text[:300]}")
        except requests.exceptions.ConnectionError:
            print(f"\n❌ Cannot connect to server at {self.server_url}")
            print("   Start it first: uvicorn main:app --host 0.0.0.0 --port 7860")
        except Exception as e:
            print(f"\n❌ Error: {e}")

    def check_server_status(self):
        print("\n=== SERVER STATUS ===")
        try:
            r = requests.get(f"{self.server_url}/caretaker-status", timeout=5)
            if r.status_code == 200:
                data = r.json()
                if data.get("configured"):
                    print(f"✅ Server is running. Patient configured: {data['patient_name']}")
                    print(f"   Medicines: {len(data.get('medicines', data.get('medications', [])))} configured")
                else:
                    print("⚠️  Server is running but NO patient configured yet.")
                    print("   Use option 11 to send config.")
            else:
                print(f"❌ Server error: {r.status_code}")
        except requests.exceptions.ConnectionError:
            print(f"❌ Server NOT running at {self.server_url}")
            print("   Start it: uvicorn main:app --host 0.0.0.0 --port 7860")
        except Exception as e:
            print(f"❌ Error: {e}")

    # ─────────────────────────────────────────────────────────
    # Main loop
    # ─────────────────────────────────────────────────────────

    def run(self):
        self.banner()
        actions = {
            "1": self.set_names,
            "2": self.add_medicine,
            "3": self.view_medicines,
            "4": self.remove_medicine,
            "5": self.add_family_member,
            "6": self.add_emergency_contact,
            "7": self.set_routine,
            "8": self.set_places,
            "9": self.set_events,
            "10": self.preview_config,
            "11": self.send_to_server,
            "12": self.check_server_status,
        }
        while True:
            self.menu()
            choice = input("Enter choice: ").strip()
            if choice == "0":
                print("\n👋 Goodbye! Run inference.py once you've sent the config.")
                break
            elif choice in actions:
                actions[choice]()
            else:
                print("❌ Invalid choice.")


if __name__ == "__main__":
    dashboard = CaretakerDashboard(server_url="https://ShriyaX-care-dem.hf.space")
    dashboard.run()
