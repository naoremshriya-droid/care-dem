import React, { useState, useEffect, useRef } from "react";
import {
  Heart,
  Trash2,
  Plus,
  Mic,
  Square,
  MapPin,
  Phone,
  MessageCircle,
  AlertCircle,
  Navigation,
  Play,
  StopCircle,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCXdxRjhmU1fPBgDHgDYkHYSMdf6EmvjG4",
  authDomain: "care-dem.firebaseapp.com",
  projectId: "care-dem",
  storageBucket: "care-dem.firebasestorage.app",
  messagingSenderId: "54041195697",
  appId: "1:54041195697:web:43bceb65053fa7d07d5e90",
  measurementId: "G-RW9VE1PM28",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const CareDemApp = () => {
  // Auth States
  const [user, setUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // App States
  const [activeTab, setActiveTab] = useState("dashboard");
  const [medicines, setMedicines] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [vitals, setVitals] = useState({ heart: 72, breathing: 18, temp: 98.2 });
  const [location, setLocation] = useState<any>(null);

  const hospitals = [
    { id: 1, name: "Apollo Hospitals Hyderabad", distance: "2 km", phone: "040-23607777", lat: 17.385, lng: 78.4867 },
    { id: 2, name: "Fortis Hospital Secunderabad", distance: "5 km", phone: "040-40400400", lat: 17.36, lng: 78.45 },
    { id: 3, name: "Max Healthcare HITEC City", distance: "8 km", phone: "040-66666666", lat: 17.4, lng: 78.52 },
    { id: 4, name: "Continental Hospitals", distance: "3 km", phone: "040-66555555", lat: 17.375, lng: 78.46 },
  ];

  const ambulances = [
    { id: 1, name: "Emergency Ambulance", phone: "108", eta: "3 mins", status: "Available" },
    { id: 2, name: "Care Medical Ambulance", phone: "040-40400400", eta: "5 mins", status: "Available" },
    { id: 3, name: "Ziqitza Ambulance", phone: "+919001010000", eta: "7 mins", status: "Available" },
  ];

  // Modal States
  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [showSOS, setShowSOS] = useState(false);

  // Voice / Alarm States
  const [isRecording, setIsRecording] = useState<string | null>(null);
  const [recordedVoices, setRecordedVoices] = useState<Record<string, string>>({});
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [alarmMedId, setAlarmMedId] = useState<string | null>(null);

  // Form States
  const [newMed, setNewMed] = useState({ name: "", dose: "", time: "" });
  const [newContact, setNewContact] = useState({ name: "", phone: "", type: "Family" });
  const [newRoutine, setNewRoutine] = useState({ task: "", time: "", completed: false });

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const triggeredRef = useRef<Record<string, boolean>>({});
  const manualAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);

  // ===== AUTH LISTENER =====
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        loadUserData(firebaseUser.uid);
        startLocationTracking();
        startVitalsTracking();
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // ===== MEDICINE & ROUTINE ALARM CHECK =====
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Check medicines
      medicines.forEach((med) => {
        if (med.time === currentTime && !triggeredRef.current[med.id]) {
          triggeredRef.current[med.id] = true;
          triggerAlarm(med);
        }
      });

      // Check routines
      routines.forEach((routine) => {
        if (routine.time === currentTime && !triggeredRef.current[routine.id]) {
          triggeredRef.current[routine.id] = true;
          triggerRoutineReminder(routine);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [medicines, routines, recordedVoices]);

  // Reset triggered alarms daily
  useEffect(() => {
    const reset = setInterval(() => { triggeredRef.current = {}; }, 24 * 60 * 60 * 1000);
    return () => clearInterval(reset);
  }, []);

  // ===== LOAD USER DATA =====
  const loadUserData = async (userId: string) => {
    try {
      const medsSnap = await getDocs(collection(db, "users", userId, "medicines"));
      setMedicines(medsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const contactsSnap = await getDocs(collection(db, "users", userId, "contacts"));
      setContacts(contactsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const routinesSnap = await getDocs(collection(db, "users", userId, "routines"));
      setRoutines(routinesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  // ===== LOCATION TRACKING =====
  const startLocationTracking = () => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => setLocation({ lat: position.coords.latitude, lng: position.coords.longitude, timestamp: new Date().toLocaleTimeString() }),
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      watchIdRef.current = watchId;
    }
  };

  // ===== VITALS TRACKING =====
  const startVitalsTracking = () => {
    setInterval(() => {
      setVitals((prev) => ({
        heart: Math.max(60, Math.min(100, prev.heart + (Math.random() - 0.5) * 10)),
        breathing: Math.max(14, Math.min(20, prev.breathing + (Math.random() - 0.5) * 4)),
        temp: Math.max(97.5, Math.min(99.5, prev.temp + (Math.random() - 0.5) * 0.5)),
      }));
    }, 5000);
  };

  // ===== TRIGGER MEDICINE ALARM WITH RECORDED VOICE =====
  const triggerAlarm = (medicine: any) => {
    // Stop any existing alarm
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current = null;
    }

    // Use recorded voice if available
    const voiceSrc = medicine.voiceUrl || recordedVoices[medicine.id];

    if (voiceSrc) {
      // ✅ PLAY RECORDED VOICE - LOOPS UNTIL STOP IS CLICKED
      const audio = new Audio(voiceSrc);
      audio.loop = true;
      audio.play().catch(() => console.log("Audio blocked"));
      alarmAudioRef.current = audio;
      setAlarmMedId(medicine.id);
    } else {
      // FALLBACK: BEEP if no voice recorded
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const beep = (delay: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.4);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.4);
        };
        beep(0);
        beep(0.5);
        beep(1.0);
      } catch (e) {
        console.log(e);
      }
      setAlarmMedId(medicine.id);
    }
  };

  // ===== TRIGGER ROUTINE REMINDER =====
  const triggerRoutineReminder = (routine: any) => {
    // Stop any existing alarm
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current = null;
    }

    // BEEP SOUND for routines (no voice recording for routines)
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const beep = (delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 700; // Different pitch
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.3);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.3);
      };
      beep(0);
      beep(0.4);
      beep(0.8);
    } catch (e) {
      console.log(e);
    }
  };

  // ===== STOP ALARM =====
  const stopAlarm = () => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
      alarmAudioRef.current = null;
    }
    setAlarmMedId(null);
  };

  // ===== MANUAL PLAY / STOP voice =====
  const playVoice = (medId: string) => {
    const src = medicines.find(m => m.id === medId)?.voiceUrl || recordedVoices[medId];
    if (!src) return;

    // If already playing → stop
    if (playingVoice === medId) {
      if (manualAudioRef.current) {
        manualAudioRef.current.pause();
        manualAudioRef.current.currentTime = 0;
        manualAudioRef.current = null;
      }
      setPlayingVoice(null);
      return;
    }

    // Stop any currently playing
    if (manualAudioRef.current) {
      manualAudioRef.current.pause();
      manualAudioRef.current = null;
    }

    const audio = new Audio(src);
    audio.loop = true;
    audio.play().catch(() => alert("Could not play audio"));
    manualAudioRef.current = audio;
    setPlayingVoice(medId);

    audio.onended = () => {
      setPlayingVoice(null);
      manualAudioRef.current = null;
    };
  };

  const stopVoicePlayback = () => {
    if (manualAudioRef.current) {
      manualAudioRef.current.pause();
      manualAudioRef.current.currentTime = 0;
      manualAudioRef.current = null;
    }
    setPlayingVoice(null);
  };

  // ===== VOICE RECORDING =====
  const startVoiceRecording = async (medicineId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const localUrl = URL.createObjectURL(audioBlob);

        setRecordedVoices((prev) => ({ ...prev, [medicineId]: localUrl }));
        stream.getTracks().forEach((track) => track.stop());

        // Upload to Firebase
        if (user) {
          try {
            const storageRef = ref(storage, `voices/${user.uid}/${medicineId}.webm`);
            await uploadBytes(storageRef, audioBlob);
            const downloadURL = await getDownloadURL(storageRef);

            // Save to Firestore
            await updateDoc(doc(db, "users", user.uid, "medicines", medicineId), {
              voiceUrl: downloadURL,
            });

            setMedicines((prev) =>
              prev.map((m) => m.id === medicineId ? { ...m, voiceUrl: downloadURL } : m)
            );
            setRecordedVoices((prev) => ({ ...prev, [medicineId]: downloadURL }));
          } catch (error) {
            console.error("Error uploading voice:", error);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(medicineId);
    } catch (error: any) {
      alert("Microphone access denied: " + error.message);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(null);
    }
  };

  // ===== ADD MEDICINE =====
  const addMedicine = async () => {
    if (!newMed.name || !newMed.time) return alert("Please enter medicine name and time");

    const tempId = Date.now().toString();
    const newEntry = { id: tempId, name: newMed.name, dose: newMed.dose || "Not specified", time: newMed.time };
    setMedicines((prev) => [...prev, newEntry]);
    setNewMed({ name: "", dose: "", time: "" });
    setShowAddMed(false);

    if (user) {
      try {
        const docRef = await addDoc(collection(db, "users", user.uid, "medicines"), {
          name: newEntry.name,
          dose: newEntry.dose,
          time: newEntry.time,
          createdAt: serverTimestamp(),
        });
        setMedicines((prev) => prev.map((m) => m.id === tempId ? { ...m, id: docRef.id } : m));
      } catch (error) {
        console.error("Error saving medicine:", error);
      }
    }
  };

  // ===== DELETE MEDICINE =====
  const deleteMedicine = async (id: string) => {
    setMedicines((prev) => prev.filter((m) => m.id !== id));
    if (user) {
      try { await deleteDoc(doc(db, "users", user.uid, "medicines", id)); }
      catch (e) { console.error(e); }
    }
  };

  // ===== ADD ROUTINE =====
  const addRoutine = async () => {
    if (!newRoutine.task || !newRoutine.time) return alert("Please fill in all fields");

    const tempId = Date.now().toString();
    const newEntry = { id: tempId, task: newRoutine.task, time: newRoutine.time, completed: false };
    setRoutines((prev) => [...prev, newEntry]);
    setNewRoutine({ task: "", time: "", completed: false });
    setShowAddRoutine(false);

    if (user) {
      try {
        const docRef = await addDoc(collection(db, "users", user.uid, "routines"), {
          task: newEntry.task, time: newEntry.time, completed: false, createdAt: serverTimestamp(),
        });
        setRoutines((prev) => prev.map((r) => r.id === tempId ? { ...r, id: docRef.id } : r));
      } catch (error) { console.error(error); }
    }
  };

  // ===== DELETE ROUTINE =====
  const deleteRoutine = async (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    if (user) {
      try { await deleteDoc(doc(db, "users", user.uid, "routines", id)); }
      catch (e) { console.error(e); }
    }
  };

  const toggleRoutine = async (id: string, completed: boolean) => {
    setRoutines((prev) => prev.map((r) => r.id === id ? { ...r, completed: !completed } : r));
    if (user) {
      try { await updateDoc(doc(db, "users", user.uid, "routines", id), { completed: !completed }); }
      catch (e) { console.error(e); }
    }
  };

  // ===== ADD CONTACT =====
  const addContact = async () => {
    if (!newContact.name || !newContact.phone) return alert("Please fill in all fields");

    const tempId = Date.now().toString();
    const newEntry = { id: tempId, name: newContact.name, phone: newContact.phone, type: newContact.type };
    setContacts((prev) => [...prev, newEntry]);
    setNewContact({ name: "", phone: "", type: "Family" });
    setShowAddContact(false);

    if (user) {
      try {
        const docRef = await addDoc(collection(db, "users", user.uid, "contacts"), {
          ...newEntry, createdAt: serverTimestamp(),
        });
        setContacts((prev) => prev.map((c) => c.id === tempId ? { ...c, id: docRef.id } : c));
      } catch (error) { console.error(error); }
    }
  };

  // ===== DELETE CONTACT =====
  const deleteContact = async (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    if (user) {
      try { await deleteDoc(doc(db, "users", user.uid, "contacts", id)); }
      catch (e) { console.error(e); }
    }
  };

  // ===== WHATSAPP =====
  const sendWhatsAppAlert = (contact: any) => {
    const message = `🚨 CAREDEM EMERGENCY ALERT! I need help! Location: https://maps.google.com/?q=${location?.lat},${location?.lng} | Heart Rate: ${Math.round(vitals.heart)} BPM`;
    window.open(`https://wa.me/${contact.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // ===== TRIGGER SOS =====
  const triggerSOS = () => {
    setShowSOS(false);
    if (contacts.length > 0) {
      window.location.href = `tel:${contacts[0].phone}`;
    } else {
      alert("Please add an emergency contact first");
    }
  };

  // ===== AUTH =====
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setEmail(""); setPassword("");
    } catch (error: any) {
      alert("Auth Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    stopAlarm();
    stopVoicePlayback();
    await signOut(auth);
    setUser(null);
    setMedicines([]); setContacts([]); setRoutines([]);
  };

  // ===== STYLES =====
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(168, 85, 247, 0.3)",
    borderRadius: "8px",
    color: "white",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const buttonStyle = (color = "linear-gradient(135deg, #ec4899, #a855f7)"): React.CSSProperties => ({
    padding: "10px 16px",
    background: color,
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
  });

  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(30, 27, 75, 0.8), rgba(30, 41, 59, 0.8))",
    border: "1px solid rgba(168, 85, 247, 0.2)",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "12px",
    color: "white",
  };

  // ===== AUTH SCREEN =====
  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Calibri, sans-serif" }}>
        <div style={{ maxWidth: "400px", width: "100%", padding: "40px", background: "rgba(30, 27, 75, 0.8)", borderRadius: "12px", border: "1px solid rgba(168, 85, 247, 0.3)" }}>
          <h1 style={{ color: "white", textAlign: "center", marginBottom: "30px", fontSize: "32px" }}>💜 CareDem</h1>
          <form onSubmit={handleAuth}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: "20px" }} required />
            <button type="submit" disabled={loading} style={{ ...buttonStyle(), width: "100%", justifyContent: "center", padding: "12px", marginBottom: "10px" }}>
              {loading ? "Loading..." : authMode === "login" ? "Login" : "Sign Up"}
            </button>
          </form>
          <button onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
            style={{ background: "transparent", color: "#c084fc", border: "none", cursor: "pointer", width: "100%", textAlign: "center", padding: "10px" }}>
            {authMode === "login" ? "Create Account" : "Already have account?"}
          </button>
        </div>
      </div>
    );
  }

  // ===== MAIN APP =====
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 25%, #1e293b 50%, #0f172a 100%)", fontFamily: "Calibri, sans-serif" }}>

      {/* ALARM BANNER - Shows when medicine alarm is ringing */}
      {alarmMedId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "linear-gradient(135deg, #dc2626, #991b1b)", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "white", fontWeight: "bold", fontSize: "16px" }}>
            💊 Medicine alarm: {medicines.find(m => m.id === alarmMedId)?.name}
          </span>
          <button onClick={stopAlarm} style={{ ...buttonStyle("rgba(255,255,255,0.2)"), border: "1px solid white" }}>
            <StopCircle size={16} /> Stop Alarm
          </button>
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: "rgba(0, 0, 0, 0.4)", padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(168, 85, 247, 0.3)", position: "sticky", top: alarmMedId ? "52px" : 0, zIndex: 100 }}>
        <h1 style={{ color: "white", margin: 0, fontSize: "24px" }}>💜 CareDem</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {location && <span style={{ color: "#c084fc", fontSize: "12px" }}>🔴 Live: {location.timestamp}</span>}
          <button onClick={handleLogout} style={buttonStyle("rgba(100, 116, 139, 1)")}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px" }}>
        {/* TABS */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "40px", overflowX: "auto", paddingBottom: "10px" }}>
          {["dashboard", "medicines", "routines", "contacts", "hospitals", "ambulance"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "10px 20px", borderRadius: "8px", border: "none", cursor: "pointer",
              background: activeTab === tab ? "linear-gradient(135deg, #ec4899, #a855f7)" : "rgba(0, 0, 0, 0.4)",
              color: "white", fontWeight: "bold", whiteSpace: "nowrap",
            }}>
              {tab === "dashboard" && "📊 Dashboard"}
              {tab === "medicines" && "💊 Medicines"}
              {tab === "routines" && "📋 Routines"}
              {tab === "contacts" && "📞 Contacts"}
              {tab === "hospitals" && "🏥 Hospitals"}
              {tab === "ambulance" && "🚑 Ambulance"}
            </button>
          ))}
        </div>

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div style={{ display: "grid", gap: "20px" }}>
            <button onClick={() => setShowSOS(true)} style={{ padding: "20px", background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "white", border: "none", borderRadius: "12px", fontSize: "20px", fontWeight: "bold", cursor: "pointer", animation: "pulse 2s infinite" }}>
              🚨 EMERGENCY SOS 🚨
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              {[
                { label: "❤️ Heart Rate", value: `${Math.round(vitals.heart)}`, unit: "BPM", color: "#fca5a5", border: "rgba(239,68,68,0.3)", bg: "rgba(239,68,68,0.1)" },
                { label: "🫁 Breathing", value: `${Math.round(vitals.breathing)}`, unit: "Breaths/min", color: "#93c5fd", border: "rgba(59,130,246,0.3)", bg: "rgba(59,130,246,0.1)" },
                { label: "🌡️ Temperature", value: `${vitals.temp.toFixed(1)}°F`, unit: "Fahrenheit", color: "#86efac", border: "rgba(34,197,94,0.3)", bg: "rgba(34,197,94,0.1)" },
              ].map((v) => (
                <div key={v.label} style={{ background: `linear-gradient(135deg, ${v.bg}, transparent)`, border: `1px solid ${v.border}`, borderRadius: "12px", padding: "20px", color: "white" }}>
                  <div style={{ color: v.color, fontWeight: "bold", marginBottom: "10px" }}>{v.label}</div>
                  <div style={{ fontSize: "36px", fontWeight: "bold" }}>{v.value}</div>
                  <div style={{ color: v.color, fontSize: "12px" }}>{v.unit}</div>
                </div>
              ))}
            </div>

            {location && (
              <div style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(59,130,246,0.2))", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "12px", padding: "20px", color: "white" }}>
                <div style={{ color: "#a5f3fc", fontWeight: "bold", marginBottom: "10px" }}>🔴 LIVE LOCATION TRACKING</div>
                <div>Lat: {location.lat.toFixed(4)}, Lng: {location.lng.toFixed(4)}</div>
                <a href={`https://maps.google.com/?q=${location.lat},${location.lng}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...buttonStyle("linear-gradient(135deg, #0ea5e9, #06b6d4)"), display: "inline-flex", marginTop: "10px", textDecoration: "none" }}>
                  🗺️ Open in Google Maps
                </a>
              </div>
            )}
          </div>
        )}

        {/* MEDICINES */}
        {activeTab === "medicines" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ color: "white", margin: 0 }}>💊 Medications</h2>
              <button onClick={() => setShowAddMed(true)} style={buttonStyle()}>
                <Plus size={18} /> Add Medicine
              </button>
            </div>

            {medicines.length === 0 ? (
              <div style={{ color: "#c084fc", textAlign: "center", padding: "40px" }}>No medicines added yet. Click "Add Medicine" to get started!</div>
            ) : (
              medicines.map((med) => (
                <div key={med.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "bold" }}>{med.name}</div>
                      <div style={{ color: "#c084fc", fontSize: "14px" }}>{med.dose} at {med.time}</div>
                      {(med.voiceUrl || recordedVoices[med.id]) && (
                        <div style={{ color: "#86efac", fontSize: "12px", marginTop: "4px" }}>🎤 Voice reminder saved</div>
                      )}
                    </div>
                    <button onClick={() => deleteMedicine(med.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                      <Trash2 size={20} color="#f87171" />
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {/* Record / Stop Recording */}
                    {isRecording === med.id ? (
                      <button onClick={stopVoiceRecording} style={buttonStyle("linear-gradient(135deg, #ef4444, #dc2626)")}>
                        <Square size={16} /> Stop Recording
                      </button>
                    ) : (
                      <button onClick={() => startVoiceRecording(med.id)} style={buttonStyle("linear-gradient(135deg, #0ea5e9, #06b6d4)")}>
                        <Mic size={16} /> Record Voice
                      </button>
                    )}

                    {/* Play / Stop voice - only shown if voice exists */}
                    {(med.voiceUrl || recordedVoices[med.id]) && (
                      playingVoice === med.id ? (
                        <button onClick={stopVoicePlayback} style={buttonStyle("linear-gradient(135deg, #ef4444, #dc2626)")}>
                          <StopCircle size={16} /> Stop
                        </button>
                      ) : (
                        <button onClick={() => playVoice(med.id)} style={buttonStyle("linear-gradient(135deg, #a855f7, #9333ea)")}>
                          <Play size={16} /> Play
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))
            )}

            {/* ADD MEDICINE MODAL */}
            {showAddMed && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                <div style={{ background: "linear-gradient(135deg, #1e1b4b, #0f172a)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "12px", padding: "24px", maxWidth: "400px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ color: "white", margin: 0 }}>Add Medicine</h3>
                    <button onClick={() => setShowAddMed(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#c084fc", fontSize: "24px" }}>✕</button>
                  </div>
                  <input type="text" placeholder="Medicine Name" value={newMed.name} onChange={(e) => setNewMed({ ...newMed, name: e.target.value })} style={inputStyle} />
                  <input type="text" placeholder="Dosage (e.g., 500mg)" value={newMed.dose} onChange={(e) => setNewMed({ ...newMed, dose: e.target.value })} style={inputStyle} />
                  <input type="time" value={newMed.time} onChange={(e) => setNewMed({ ...newMed, time: e.target.value })} style={inputStyle} />
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setShowAddMed(false)} style={{ ...buttonStyle("rgba(100,116,139,1)"), flex: 1, justifyContent: "center" }}>Cancel</button>
                    <button onClick={addMedicine} style={{ ...buttonStyle(), flex: 1, justifyContent: "center" }}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ROUTINES */}
        {activeTab === "routines" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ color: "white", margin: 0 }}>📋 Daily Routines</h2>
              <button onClick={() => setShowAddRoutine(true)} style={buttonStyle()}>
                <Plus size={18} /> Add Routine
              </button>
            </div>

            {routines.length === 0 ? (
              <div style={{ color: "#c084fc", textAlign: "center", padding: "40px" }}>No routines yet. Click "Add Routine" to create one!</div>
            ) : (
              routines.map((routine) => (
                <div key={routine.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    <input type="checkbox" checked={routine.completed || false} onChange={() => toggleRoutine(routine.id, routine.completed || false)} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                    <div>
                      <div style={{ fontWeight: "bold", textDecoration: routine.completed ? "line-through" : "none", color: routine.completed ? "#86efac" : "white" }}>{routine.task}</div>
                      <div style={{ color: "#c084fc", fontSize: "12px" }}>At {routine.time}</div>
                    </div>
                  </div>
                  <button onClick={() => deleteRoutine(routine.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                    <Trash2 size={20} color="#f87171" />
                  </button>
                </div>
              ))
            )}

            {showAddRoutine && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                <div style={{ background: "linear-gradient(135deg, #1e1b4b, #0f172a)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "12px", padding: "24px", maxWidth: "400px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ color: "white", margin: 0 }}>Add Routine</h3>
                    <button onClick={() => setShowAddRoutine(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#c084fc", fontSize: "24px" }}>✕</button>
                  </div>
                  <input type="text" placeholder="Task (e.g., Breakfast)" value={newRoutine.task} onChange={(e) => setNewRoutine({ ...newRoutine, task: e.target.value })} style={inputStyle} />
                  <input type="time" value={newRoutine.time} onChange={(e) => setNewRoutine({ ...newRoutine, time: e.target.value })} style={inputStyle} />
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setShowAddRoutine(false)} style={{ ...buttonStyle("rgba(100,116,139,1)"), flex: 1, justifyContent: "center" }}>Cancel</button>
                    <button onClick={addRoutine} style={{ ...buttonStyle(), flex: 1, justifyContent: "center" }}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTACTS */}
        {activeTab === "contacts" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ color: "white", margin: 0 }}>📞 Emergency Contacts</h2>
              <button onClick={() => setShowAddContact(true)} style={buttonStyle()}>
                <Plus size={18} /> Add Contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div style={{ color: "#c084fc", textAlign: "center", padding: "40px" }}>No contacts yet. Click "Add Contact"!</div>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: "16px" }}>{contact.name}</div>
                      <div style={{ color: "#f472b6", margin: "5px 0" }}>{contact.phone}</div>
                      <span style={{ display: "inline-block", padding: "4px 8px", background: "rgba(236,72,153,0.2)", color: "#f472b6", fontSize: "12px", borderRadius: "4px" }}>
                        {contact.type}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => { window.location.href = `tel:${contact.phone}`; }} style={buttonStyle("linear-gradient(135deg, #22c55e, #16a34a)")}>
                        <Phone size={16} /> Call
                      </button>
                      <button onClick={() => sendWhatsAppAlert(contact)} style={buttonStyle("linear-gradient(135deg, #10b981, #059669)")}>
                        <MessageCircle size={16} /> WhatsApp
                      </button>
                      <button onClick={() => deleteContact(contact.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                        <Trash2 size={20} color="#f87171" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            {showAddContact && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                <div style={{ background: "linear-gradient(135deg, #1e1b4b, #0f172a)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "12px", padding: "24px", maxWidth: "400px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ color: "white", margin: 0 }}>Add Contact</h3>
                    <button onClick={() => setShowAddContact(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#c084fc", fontSize: "24px" }}>✕</button>
                  </div>
                  <input type="text" placeholder="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} style={inputStyle} />
                  <input type="tel" placeholder="Phone (e.g., +911234567890)" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} style={inputStyle} />
                  <select value={newContact.type} onChange={(e) => setNewContact({ ...newContact, type: e.target.value })} style={inputStyle}>
                    <option value="Family">Family</option>
                    <option value="Doctor">Doctor</option>
                    <option value="Hospital">Hospital</option>
                  </select>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setShowAddContact(false)} style={{ ...buttonStyle("rgba(100,116,139,1)"), flex: 1, justifyContent: "center" }}>Cancel</button>
                    <button onClick={addContact} style={{ ...buttonStyle(), flex: 1, justifyContent: "center" }}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HOSPITALS */}
        {activeTab === "hospitals" && (
          <div>
            <h2 style={{ color: "white", marginBottom: "20px" }}>🏥 Nearby Hospitals</h2>
            {hospitals.map((hospital) => (
              <div key={hospital.id} style={cardStyle}>
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>{hospital.name}</div>
                  <div style={{ color: "#c084fc", fontSize: "14px", margin: "5px 0" }}>{hospital.distance}</div>
                  <div style={{ color: "#a5f3fc", fontSize: "12px" }}>{hospital.phone}</div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => window.open(`https://www.google.com/maps/search/${hospital.name}/@${hospital.lat},${hospital.lng},15z`, "_blank")} style={buttonStyle("linear-gradient(135deg, #0ea5e9, #06b6d4)")}>
                    <Navigation size={16} /> Navigate
                  </button>
                  <button onClick={() => { window.location.href = `tel:${hospital.phone}`; }} style={buttonStyle("linear-gradient(135deg, #22c55e, #16a34a)")}>
                    <Phone size={16} /> Call
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AMBULANCE */}
        {activeTab === "ambulance" && (
          <div>
            <h2 style={{ color: "white", marginBottom: "20px" }}>🚑 Emergency Ambulance</h2>
            {ambulances.map((ambulance) => (
              <div key={ambulance.id} style={cardStyle}>
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>{ambulance.name}</div>
                  <div style={{ color: "#c084fc", margin: "5px 0" }}>Phone: {ambulance.phone}</div>
                  <span style={{ display: "inline-block", padding: "4px 8px", background: "rgba(34,197,94,0.2)", color: "#86efac", fontSize: "12px", borderRadius: "4px" }}>
                    {ambulance.status} - ETA: {ambulance.eta}
                  </span>
                </div>
                <button onClick={() => { window.location.href = `tel:${ambulance.phone}`; }} style={{ ...buttonStyle("linear-gradient(135deg, #dc2626, #991b1b)"), width: "100%", justifyContent: "center" }}>
                  <Phone size={18} /> CALL AMBULANCE NOW
                </button>
              </div>
            ))}
            <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(185,28,28,0.05))", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "16px", marginTop: "20px", color: "#fca5a5" }}>
              <AlertCircle size={20} style={{ display: "inline", marginRight: "10px" }} />
              <strong>Emergency:</strong> Calling 108 is free and available 24/7 for emergency ambulance services.
            </div>
          </div>
        )}
      </div>

      {/* SOS MODAL WITH HIGH-PITCHED SOUND */}
      {showSOS && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", border: "2px solid #fca5a5", borderRadius: "12px", padding: "40px", textAlign: "center", maxWidth: "400px", width: "100%" }}>
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>🚨</div>
            <h2 style={{ color: "white", margin: "0 0 16px 0" }}>EMERGENCY SOS</h2>
            <p style={{ color: "#fca5a5", marginBottom: "20px" }}>This will call your first emergency contact</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowSOS(false)} style={{ ...buttonStyle("rgba(100,116,139,1)"), flex: 1, justifyContent: "center", padding: "12px" }}>Cancel</button>
              <button onClick={() => {
                // ✅ PLAY HIGH-PITCHED SOS SIREN
                try {
                  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                  const sosBleep = (delay: number, freq: number) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = freq; // HIGH PITCH 1200 Hz
                    gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.3);
                    osc.start(ctx.currentTime + delay);
                    osc.stop(ctx.currentTime + delay + 0.3);
                  };
                  // SOS Pattern: 3 short, 3 long, 3 short
                  sosBleep(0, 1200);     // HIGH
                  sosBleep(0.4, 1200);   // HIGH
                  sosBleep(0.8, 1200);   // HIGH
                  sosBleep(1.3, 1200);   // LONG
                  sosBleep(2.0, 1200);   // LONG
                  sosBleep(2.7, 1200);   // LONG
                  sosBleep(3.4, 1200);   // HIGH
                  sosBleep(3.8, 1200);   // HIGH
                  sosBleep(4.2, 1200);   // HIGH
                } catch (e) {
                  console.log(e);
                }
                triggerSOS();
              }}
                style={{ ...buttonStyle("linear-gradient(135deg, #22c55e, #16a34a)"), flex: 1, justifyContent: "center", padding: "12px", fontSize: "16px" }}>
                ✓ ACTIVATE SOS
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1); }
        select option { background: #1e1b4b; color: white; }
      `}</style>
    </div>
  );
};

export default CareDemApp;
