import React, { useState, useEffect, useRef } from "react";
import { Heart, Trash2 } from "lucide-react";
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
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Firebase Config
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
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPatient, setIsPatient] = useState(true);
  const [loading, setLoading] = useState(false);

  // App States
  const [activeTab, setActiveTab] = useState("dashboard");
  const [medicines, setMedicines] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [medicineHistory, setMedicineHistory] = useState([]);
  const [vitals, setVitals] = useState({
    heart: 72,
    breathing: 18,
    temp: 98.2,
  });
  const [location, setLocation] = useState(null);
  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [isRecording, setIsRecording] = useState(null);
  const [recordedVoices, setRecordedVoices] = useState({});
  const [pushNotificationEnabled, setPushNotificationEnabled] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(null);

  // Form States
  const [newMed, setNewMed] = useState({
    name: "",
    dose: "",
    time: "",
  });
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    type: "Family",
  });
  const [newRoutine, setNewRoutine] = useState({
    task: "",
    time: "",
    completed: false,
  });

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const watchIntervalRef = useRef(null);
  const triggeredRef = useRef({});

  // ===== AUTH EFFECTS =====
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");
  
      medicines.forEach((med) => {
        if (med.time === currentTime && !med.triggered) {
          triggerAlarm(med);
  
          // mark as triggered (avoid repeat)
          setMedicines((prev) =>
            prev.map((m) =>
              m.id === med.id ? { ...m, triggered: true } : m
            )
          );
        }
      });
    }, 60000); // check every minute
  
    return () => clearInterval(interval);
  }, [medicines]);

  useEffect(() => {
    const midnight = setInterval(() => {
      setMedicines((prev) =>
        prev.map((m) => ({ ...m, triggered: false }))
      );
    }, 86400000); // 24 hrs
  
    return () => clearInterval(midnight);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        loadUserData(firebaseUser.uid);
        startLocationTracking();
        startVitalsTracking();
        requestPushNotifications();
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const reset = setInterval(() => {
      triggeredRef.current = {};
    }, 24 * 60 * 60 * 1000); // reset daily

    return () => clearInterval(reset);
  }, []);

  // ===== LOAD USER DATA =====
  const loadUserData = async (userId) => {
    try {
      // Load medicines
      const medsSnap = await getDocs(
        collection(db, "users", userId, "medicines")
      );
      setMedicines(medsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

      // Load contacts
      const contactsSnap = await getDocs(
        collection(db, "users", userId, "contacts")
      );
      setContacts(
        contactsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );

      // Load routines
      const routinesSnap = await getDocs(
        collection(db, "users", userId, "routines")
      );
      setRoutines(
        routinesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );

      // Load history
      const historySnap = await getDocs(
        collection(db, "users", userId, "medicineHistory")
      );
      setMedicineHistory(
        historySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
    } catch (error) {
      console.error("Error loading user data:", error);
      addNotification("❌ Error", "Failed to load data", "error");
    }
  };

  // ===== AUTH FUNCTIONS =====
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        addNotification("✅ Login Success", "Welcome back!", "success");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        addNotification("✅ Account Created", "Welcome to CareDem!", "success");
      }
      setEmail("");
      setPassword("");
    } catch (error) {
      addNotification("❌ Auth Error", error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setMedicines([]);
      setContacts([]);
      setPhotos([]);
      setRoutines([]);
      addNotification("👋 Logged Out", "See you soon!", "info");
    } catch (error) {
      addNotification("❌ Error", error.message, "error");
    }
  };

  // ===== NOTIFICATION SYSTEM =====
  const addNotification = (title, message, type = "info") => {
    const id = Date.now();
    const newNotif = { id, title, message, type };
    setNotifications((prev) => [newNotif, ...prev].slice(0, 10));


    // Play notification sound
    playNotificationSound(type);
  // ===== NOTIFICATION SOUND =====
  const playNotificationSound = (type) => {
    try {
      // Create a simple beep using Web Audio API
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      if (type === "success") {
        oscillator.frequency.value = 800; // Higher pitch for success
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.3
        );
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } else if (type === "error") {
        oscillator.frequency.value = 400; // Lower pitch for error
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5
        );
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } else if (type === "sos") {
        // SOS alert - three beeps
        const beep = () => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.frequency.value = 600;
          gain.gain.setValueAtTime(0.3, audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + 0.2
          );
          osc.start(audioContext.currentTime);
          osc.stop(audioContext.currentTime + 0.2);
        };
        beep();
        setTimeout(beep, 250);
        setTimeout(beep, 500);
      } else {
        // Info sound - medium pitch
        oscillator.frequency.value = 600;
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.3
        );
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      }
    } catch (error) {
      console.error("Error playing notification sound:", error);
    }
  };

  const triggerAlarm = (medicine) => {
    // STOP previous audio first
if (currentAudio) {
  currentAudio.pause();
  currentAudio.currentTime = 0;
}

// 🎤 Use recorded voice if available
let audio;

if (recordedVoices[medicine.id]) {
  audio = new Audio(recordedVoices[medicine.id]);
} else {
  audio = new Audio("/alarm.mp3");
}

audio.loop = true;
audio.play();

setCurrentAudio(audio);
  
    // 📲 WhatsApp alert also triggered
    sendWhatsAppAlert(medicine);
  
    addNotification(
      "⏰ Reminder",
      `Time to take ${medicine.name}`,
      "medicine"
    );
  };

  const markAsTaken = (medicine) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
  
    addNotification("✅ Taken", `${medicine.name} taken`, "success");
  };
  const sendWhatsAppAlert = (medicine) => {
    const phone = "91XXXXXXXXXX"; // 👉 replace with caregiver number
  
    const message = `Reminder: Take ${medicine.name} now!`;
  
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  
    window.open(url, "_blank");
  };

  const startVoiceRecording = async (medicineId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
  
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
  
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
  
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
  
        const audioUrl = URL.createObjectURL(audioBlob);
  
        setRecordedVoices((prev) => ({
          ...prev,
          [medicineId]: audioUrl,
        }));
  
        try {
          const storageRef = ref(
            storage,
            `voices/${user.uid}/${medicineId}.webm`
          );
  
          await uploadBytes(storageRef, audioBlob);
          const downloadURL = await getDownloadURL(storageRef);
  
          setRecordedVoices((prev) => ({
            ...prev,
            [medicineId]: downloadURL,
          }));
        } catch (e) {
          console.error("Upload failed:", e);
        }
      };
  
      mediaRecorder.start();
      setIsRecording(medicineId);
  
    } catch (error) {
      console.error(error);
    }
  };
  
  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(null);
    }
  };

  const addMedicine = async () => {
    const newItem = {
      ...newMed,
      id: Date.now(),
      triggered: false,
    };
  
    setMedicines((prev) => [...prev, newItem]); // instant
  
    setShowAddMed(false);
  
    try {
      await saveToFirebase(newItem);
    } catch (err) {
      console.error(err);
    }
  };

  // ===== LOCATION TRACKING =====
  const startLocationTracking = () => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({
            lat: latitude,
            lng: longitude,
            timestamp: new Date().toLocaleTimeString(),
          });
          saveLocationToDatabase(latitude, longitude);
        },
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      watchIntervalRef.current = watchId;
    }
  };

  const saveLocationToDatabase = async (lat, lng) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "users", user.uid, "locations"), {
        lat,
        lng,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error saving location:", error);
    }
  };

  // ===== VITALS TRACKING =====
  const startVitalsTracking = () => {
    setInterval(() => {
      setVitals((prev) => ({
        heart: Math.max(
          60,
          Math.min(100, prev.heart + (Math.random() - 0.5) * 10)
        ),
        breathing: Math.max(
          14,
          Math.min(20, prev.breathing + (Math.random() - 0.5) * 4)
        ),
        temp: Math.max(
          97.5,
          Math.min(99.5, prev.temp + (Math.random() - 0.5) * 0.5)
        ),
      }));
    }, 5000);
  };

  // ===== PUSH NOTIFICATIONS =====
  const requestPushNotifications = async () => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        setPushNotificationEnabled(true);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            setPushNotificationEnabled(true);
          }
        });
      }
    }
  };

  // ===== MEDICINE FUNCTIONS =====
  const deleteMedicine = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "medicines", id));
      setMedicines(medicines.filter((m) => m.id !== id));
      addNotification("🗑️ Deleted", "Medicine removed", "info");
    } catch (error) {
      addNotification("❌ Error", "Failed to delete", "error");
    }
  };

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    setCurrentAudio(null);
  }
  if (currentAudio) {
    currentAudio.pause();
  }

  const logMedicineTaken = async (medicine) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "users", user.uid, "medicineHistory"), {
        medicineName: medicine.name,
        dose: medicine.dose,
        takenAt: serverTimestamp(),
      });

      setMedicineHistory([
        ...medicineHistory,
        {
          medicineName: medicine.name,
          dose: medicine.dose,
          takenAt: new Date().toLocaleString(),
        },
      ]);
      addNotification("✅ Logged", `${medicine.name} logged!`, "success");
    } catch (error) {
      addNotification("❌ Error", "Failed to log medicine", "error");
    }
  };

  // ===== CONTACT FUNCTIONS =====
  const addContact = async () => {
    if (!newContact.name || !newContact.phone || !user) {
      alert("Please fill in all fields");
      return;
    }

    try {
      const docRef = await addDoc(
        collection(db, "users", user.uid, "contacts"),
        {
          ...newContact,
          createdAt: serverTimestamp(),
        }
      );

      setContacts((prev) => [...prev, newContact]);
      setNewContact({ name: "", phone: "", type: "Family" });
      setShowAddContact(false);
      addNotification("👤 Added", `${newContact.name} added!`, "success");
    } catch (error) {
      addNotification("❌ Error", "Failed to add contact", "error");
    }
  };

  const deleteContact = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "contacts", id));
      setContacts(contacts.filter((c) => c.id !== id));
      addNotification("🗑️ Deleted", "Contact removed", "info");
    } catch (error) {
      addNotification("❌ Error", "Failed to delete", "error");
    }
  };

  // ===== ROUTINE FUNCTIONS =====
  const addRoutine = async () => {
    if (!newRoutine.task || !newRoutine.time || !user) {
      alert("Please fill in all fields");
      return;
    }

    try {
      const docRef = await addDoc(
        collection(db, "users", user.uid, "routines"),
        {
          task: newRoutine.task,
          time: newRoutine.time,
          completed: false,
          createdAt: serverTimestamp(),
        }
      );
      setRoutines((prev) => [...prev, newRoutine]);
      setNewRoutine({ task: "", time: "", completed: false });
      setShowAddRoutine(false);
      addNotification("⏰ Added", `${newRoutine.task} added!`, "success");
    } catch (error) {
      console.error("Error adding routine:", error);
      addNotification("❌ Error", "Failed to add routine", "error");
    }
  };

  const deleteRoutine = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "routines", id));
      setRoutines(routines.filter((r) => r.id !== id));
      addNotification("🗑️ Deleted", "Routine removed", "info");
    } catch (error) {
      addNotification("❌ Error", "Failed to delete", "error");
    }
  };

  const toggleRoutineComplete = async (id, completed) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "routines", id), {
        completed: !completed,
      });
      setRoutines(
        routines.map((r) => (r.id === id ? { ...r, completed: !completed } : r))
      );
    } catch (error) {
      addNotification("❌ Error", "Failed to update", "error");
    }
  };

  // ===== EMERGENCY SOS =====
  const findNearbyHospitals = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
  
        const url = `https://www.google.com/maps/search/hospitals+near+me/?q=${lat},${lng}`;
  
        window.open(url, "_blank");
      },
      (error) => {

        alert("Location access denied!");
      }
    );
  };

  
  const triggerSOS = async () => {
  addNotification("🚨 SOS ACTIVE", "Emergency alert sent!", "sos");

  if (contacts.length > 0) {
    const phone = contacts[0].phone;

    // Only allow tel: on mobile
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.location.href = `tel:${phone}`;
    } else {
      alert(`Call this number: ${phone}`);
    }
  }

  setShowSOS(false);
};

  const copyLocation = () => {
    if (location) {
      const text = `Latitude: ${location.lat}, Longitude: ${location.lng}`;
      navigator.clipboard.writeText(text);
      alert("Location copied!");
    }
  };
  <div>
  <h3>🚑 Emergency Help</h3>

  {location && (
    <>
      <p>Latitude: {location.lat}</p>
      <p>Longitude: {location.lng}</p>

      <button onClick={copyLocation}>📋 Copy Location</button>

      <button
        onClick={() =>
          window.open(
            `https://www.google.com/maps/search/hospitals/@${location.lat},${location.lng}`,
            "_blank"
          )
        }
      >
        🏥 Nearby Hospitals
      </button>

      <button
        onClick={() =>
          window.open(
            `https://www.google.com/search?q=ambulance+near+me`,
            "_blank"
          )
        }
      >
        🚑 Ambulance
      </button>
    </>
  )}
</div>

  // ===== STYLES =====
  const styles = {
    container: {
      minHeight: "100vh",
      background:
        "linear-gradient(135deg, #0f172a 0%, #1e1b4b 25%, #1e293b 50%, #0f172a 100%)",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    },
    header: {
      background: "rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(10px)",
      borderBottom: "1px solid rgba(168, 85, 247, 0.3)",
      padding: "20px 40px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "sticky" as const,
      top: 0,
      zIndex: 50,
    },
    card: (gradient) => ({
      background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
      border: "1px solid rgba(168, 85, 247, 0.3)",
      borderRadius: "12px",
      padding: "20px",
      backdropFilter: "blur(10px)",
      marginBottom: "16px",
    }),
    button: (color) => ({
      padding: "10px 20px",
      background: color,
      color: "white",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: "bold" as const,
      transition: "all 0.3s",
    }),
  };

  // ===== AUTH SCREEN =====
  if (!user) {
    return (
      <div style={styles.container}>
        <div
          style={{
            maxWidth: "400px",
            margin: "100px auto",
            padding: "40px",
            ...styles.card([
              "rgba(168, 85, 247, 0.2)",
              "rgba(236, 72, 153, 0.2)",
            ]),
          }}
        >
          <h1
            style={{
              color: "white",
              textAlign: "center",
              marginBottom: "30px",
            }}
          >
            💜 CareDem
          </h1>

          <div
            style={{
              marginBottom: "20px",
              display: "flex",
              gap: "10px",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => {
                setAuthMode("login");
                setIsPatient(true);
              }}
              style={{
                ...styles.button(
                  authMode === "login" && isPatient
                    ? "linear-gradient(135deg, #ec4899, #a855f7)"
                    : "rgba(100, 116, 139, 1)"
                ),
              }}
            >
              Patient
            </button>
            <button
              onClick={() => {
                setAuthMode("login");
                setIsPatient(false);
              }}
              style={{
                ...styles.button(
                  authMode === "login" && !isPatient
                    ? "linear-gradient(135deg, #ec4899, #a855f7)"
                    : "rgba(100, 116, 139, 1)"
                ),
              }}
            >
              Caregiver
            </button>
          </div>

          <form onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "10px",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "8px",
                color: "white",
                boxSizing: "border-box",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "20px",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "8px",
                color: "white",
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button("linear-gradient(135deg, #ec4899, #a855f7)"),
                width: "100%",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading
                ? "Loading..."
                : authMode === "login"
                ? "Login"
                : "Sign Up"}
            </button>
          </form>

          <button
            onClick={() =>
              setAuthMode(authMode === "login" ? "signup" : "login")
            }
            style={{
              marginTop: "10px",
              background: "transparent",
              color: "#c084fc",
              border: "none",
              cursor: "pointer",
              width: "100%",
            }}
          >
            {authMode === "login" ? "Create Account" : "Already have account?"}
          </button>
        </div>
      </div>
    );
  }

  // ===== MAIN APP =====
  return (
    <div style={styles.container}>
      {/* Notifications */}
      <div
        style={{
          position: "fixed",
          top: "100px",
          right: "20px",
          zIndex: 1000,
          maxWidth: "350px",
        }}
      >
        {notifications.map((notif) => (
          <div
            key={notif.id}
            style={{
              background:
                notif.type === "success"
                  ? "rgba(34, 197, 94, 0.9)"
                  : notif.type === "error"
                  ? "rgba(220, 38, 38, 0.9)"
                  : "rgba(59, 130, 246, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "10px",
              color: "white",
              backdropFilter: "blur(10px)",
              animation: "slideIn 0.3s ease-out",
              fontSize: "14px",
            }}
          >
            <div style={{ fontWeight: "bold" }}>{notif.title}</div>
            <div style={{ opacity: 0.9 }}>{notif.message}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <Heart size={32} color="#ec4899" fill="#ec4899" />
          <h1 style={{ color: "white", margin: "0", fontSize: "24px" }}>
            CareDem
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {location && (
            <span style={{ color: "#c084fc", fontSize: "12px" }}>
              🔴 Live: {location.timestamp}
            </span>
          )}
          <button
            onClick={handleLogout}
            style={{
              ...styles.button("rgba(100, 116, 139, 1)"),
              padding: "8px 16px",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px" }}
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "40px",
            overflowX: "auto",
          }}
        >
          {[
            "dashboard",
            "medicines",
            "routines",
            "contacts",
            "location",
            "history",
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                background:
                  activeTab === tab
                    ? "linear-gradient(135deg, #ec4899, #a855f7)"
                    : "rgba(0, 0, 0, 0.4)",
                color: "white",
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <><div style={{ display: "grid", gap: "20px" }}>
            <button
              onClick={() => setShowSOS(true)}
              style={{
                padding: "20px",
                background: "linear-gradient(135deg, #dc2626, #991b1b)",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "20px",
                fontWeight: "bold",
                cursor: "pointer",
                animation: "pulse 2s infinite",
              }} />
            <button onClick={sendWhatsAppAlert}>
              📱 Send WhatsApp Alert
            </button>
            <div>
            🚨 EMERGENCY SOS 🚨
            </div>
            <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
              <div
                style={styles.card([
                  "rgba(239, 68, 68, 0.1)",
                  "rgba(185, 28, 28, 0.05)",
                ])}
              >
                <div
                  style={{
                    color: "#fca5a5",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  Heart Rate
                </div>
                <div
                  style={{
                    fontSize: "36px",
                    fontWeight: "bold",
                    color: "white",
                  }}
                >
                  {Math.round(vitals.heart)}
                </div>
                <div style={{ color: "#fca5a5", fontSize: "12px" }}>BPM</div>
              </div>

              <div
                style={styles.card([
                  "rgba(59, 130, 246, 0.1)",
                  "rgba(37, 99, 235, 0.05)",
                ])}
              >
                <div
                  style={{
                    color: "#93c5fd",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  Breathing
                </div>
                <div
                  style={{
                    fontSize: "36px",
                    fontWeight: "bold",
                    color: "white",
                  }}
                >
                  {Math.round(vitals.breathing)}
                </div>
                <div style={{ color: "#93c5fd", fontSize: "12px" }}>
                  Breaths/min
                </div>
              </div>

              <div
                style={styles.card([
                  "rgba(34, 197, 94, 0.1)",
                  "rgba(22, 163, 74, 0.05)",
                ])}
              >
                <div
                  style={{
                    color: "#86efac",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  Temperature
                </div>
                <div
                  style={{
                    fontSize: "36px",
                    fontWeight: "bold",
                    color: "white",
                  }}
                >
                  {vitals.temp.toFixed(1)}°
                </div>
                <div style={{ color: "#86efac", fontSize: "12px" }}>F</div>
              </div>
            </div></>

            {medicines.length > 0 && (
              <div
                style={styles.card([
                  "rgba(168, 85, 247, 0.2)",
                  "rgba(236, 72, 153, 0.2)",
                ])}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "white",
                        fontWeight: "bold",
                        fontSize: "18px",
                      }}
                    >
                      Next Medication
                    </div>
                    <div style={{ color: "#d8b4fe" }}>
                      {medicines[0].name} • {medicines[0].dose}
                    </div>
                    <div style={{ color: "#c084fc", fontSize: "14px" }}>
                      Due at {medicines[0].time}
                    </div>
                  </div>
                  <button
                    onClick={() => logMedicineTaken(medicines[0])}
                    style={{
                      ...styles.button(
                        "linear-gradient(135deg, #22c55e, #16a34a)"
                      ),
                      padding: "12px 24px",
                    }}
                  >
                    ✓ Taken
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Medicines Tab */}
        {activeTab === "medicines" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ color: "white", margin: "0" }}>Medications</h2>
              <button
                onClick={() => setShowAddMed(true)}
                style={{
                  ...styles.button("linear-gradient(135deg, #ec4899, #a855f7)"),
                }}
              >
                + Add Medicine
              </button>
            </div>

            {medicines.map((med) => (
              <div
                key={med.id}
                style={styles.card([
                  "rgba(30, 27, 75, 0.8)",
                  "rgba(30, 41, 59, 0.8)",
                ])}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "white",
                        fontWeight: "bold",
                        fontSize: "18px",
                      }}
                    >
                      {med.name}
                    </div>
                    <div style={{ color: "#c084fc" }}>{med.dose}</div>
                    <div style={{ color: "#a5f3fc", fontSize: "12px" }}>
                      ⏰ {med.time}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMedicine(med.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "20px",
                    }}
                  >
                    🗑️
                  </button>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {isRecording === med.id ? (
                    <button
                      onClick={stopVoiceRecording}
                      style={{
                        ...styles.button(
                          "linear-gradient(135deg, #ef4444, #dc2626)"
                        ),
                        flex: 1,
                        minWidth: "140px",
                      }}
                    >
                      ⏹️ STOP RECORDING
                    </button>
                  ) : (
                    <button
                      onClick={() => startVoiceRecording(med.id)}
                      style={{
                        ...styles.button(
                          "linear-gradient(135deg, #0ea5e9, #06b6d4)"
                        ),
                        flex: 1,
                        minWidth: "140px",
                      }}
                    >
                      🎤 RECORD VOICE
                    </button>
                  )}

                  {recordedVoices[med.id] && (
                    <button
                      onClick={() => {
                        const audio = new Audio(recordedVoices[med.id]);
                        audio.play();
                      }}
                      style={{
                        ...styles.button(
                          "linear-gradient(135deg, #a855f7, #9333ea)"
                        ),
                      }}
                    >
                      🔊 PLAY
                    </button>
                  )}

                  <button
                    onClick={() => logMedicineTaken(med)}
                    style={{
                      ...styles.button(
                        "linear-gradient(135deg, #22c55e, #16a34a)"
                      ),
                      flex: 1,
                      minWidth: "100px",
                      // ===== TRIGGER ALARM =====

                    }}
                  >
                    ✅ TAKEN
                    <button onClick={() => startVoiceRecording(medicine.id)}>
  🎤 RECORD VOICE
</button>

<button onClick={() => playVoice(medicine.id)}>
  🔊 PLAY
</button>

<button onClick={() => handleMedicineTaken(medicine)}>
  ✅ TAKEN
</button>

{/* 🔥 ADD THIS HERE */}
<button
  onClick={() => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
  }}
  style={{ background: "red", color: "white", marginTop: "8px" }}
>
  ⛔ STOP
</button>
                  </button>
                </div>
              </div>
            ))}

            {showAddMed && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #1e1b4b, #0f172a)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    borderRadius: "12px",
                    padding: "24px",
                    maxWidth: "400px",
                    width: "100%",
                  }}
                >
                  <h3 style={{ color: "white", margin: "0 0 16px 0" }}>
                    Add Medicine
                  </h3>
                  <input
                    type="text"
                    placeholder="Medicine Name (Required)"
                    value={newMed.name}
                    onChange={(e) =>
                      setNewMed({ ...newMed, name: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Dosage (Optional)"
                    value={newMed.dose}
                    onChange={(e) =>
                      setNewMed({ ...newMed, dose: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <input
                    type="time"
                    value={newMed.time}
                    onChange={(e) =>
                      setNewMed({ ...newMed, time: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "15px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => setShowAddMed(false)}
                      style={{
                        ...styles.button("rgba(100, 116, 139, 1)"),
                        flex: 1,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addMedicine}
                      style={{
                        ...styles.button(
                          "linear-gradient(135deg, #ec4899, #a855f7)"
                        ),
                        flex: 1,
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Routines Tab */}
        {activeTab === "routines" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ color: "white", margin: "0" }}>Daily Routines</h2>
              <button
                onClick={() => setShowAddRoutine(true)}
                style={{
                  ...styles.button("linear-gradient(135deg, #ec4899, #a855f7)"),
                }}
              >
                + Add Routine
              </button>
            </div>

            {routines.map((routine) => (
              <div
                key={routine.id}
                style={{
                  ...styles.card([
                    "rgba(30, 27, 75, 0.8)",
                    "rgba(30, 41, 59, 0.8)",
                  ]),
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "15px" }}
                >
                  <input
                    type="checkbox"
                    checked={routine.completed || false}
                    onChange={() =>
                      toggleRoutineComplete(
                        routine.id,
                        routine.completed || false
                      )
                    }
                    style={{ width: "24px", height: "24px", cursor: "pointer" }}
                  />
                  <div>
                    <div
                      style={{
                        color: routine.completed ? "#86efac" : "white",
                        fontWeight: "bold",
                        textDecoration: routine.completed
                          ? "line-through"
                          : "none",
                      }}
                    >
                      {routine.task}
                    </div>
                    <div style={{ color: "#c084fc", fontSize: "12px" }}>
                      ⏰ {routine.time}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  {routine.completed && (
                    <span style={{ color: "#22c55e" }}>✅</span>
                  )}
                  <button
                    onClick={() => deleteRoutine(routine.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}

            {showAddRoutine && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #1e1b4b, #0f172a)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    borderRadius: "12px",
                    padding: "24px",
                    maxWidth: "400px",
                    width: "100%",
                  }}
                >
                  <h3 style={{ color: "white", margin: "0 0 16px 0" }}>
                    Add Routine
                  </h3>
                  <input
                    type="text"
                    placeholder="Task (e.g., Yoga, Walk)"
                    value={newRoutine.task}
                    onChange={(e) =>
                      setNewRoutine({ ...newRoutine, task: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <input
                    type="time"
                    value={newRoutine.time}
                    onChange={(e) =>
                      setNewRoutine({ ...newRoutine, time: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "15px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => setShowAddRoutine(false)}
                      style={{
                        ...styles.button("rgba(100, 116, 139, 1)"),
                        flex: 1,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addRoutine}
                      style={{
                        ...styles.button(
                          "linear-gradient(135deg, #ec4899, #a855f7)"
                        ),
                        flex: 1,
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === "contacts" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ color: "white", margin: "0" }}>
                Emergency Contacts
              </h2>
              <button
                onClick={() => setShowAddContact(true)}
                style={{
                  ...styles.button("linear-gradient(135deg, #ec4899, #a855f7)"),
                }}
              >
                + Add Contact
              </button>
            </div>

            {contacts.map((contact) => (
              <div
                key={contact.id}
                style={{
                  ...styles.card([
                    "rgba(30, 27, 75, 0.8)",
                    "rgba(30, 41, 59, 0.8)",
                  ]),
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: "white", fontWeight: "bold" }}>
                    {contact.name}
                  </div>
                  <div style={{ color: "#f472b6" }}>{contact.phone}</div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      background: "rgba(236, 72, 153, 0.2)",
                      color: "#f472b6",
                      fontSize: "12px",
                      borderRadius: "4px",
                      marginTop: "4px",
                    }}
                  >
                    {contact.type}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <a
                    href={`tel:${contact.phone}`}
                    style={{
                      ...styles.button(
                        "linear-gradient(135deg, #22c55e, #16a34a)"
                      ),
                      textDecoration: "none",
                    }}
                  >
                    📞 Call
                  </a>
                  <button
                    onClick={() => deleteContact(contact.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "20px",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}

            {showAddContact && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #1e1b4b, #0f172a)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    borderRadius: "12px",
                    padding: "24px",
                    maxWidth: "400px",
                    width: "100%",
                  }}
                >
                  <h3 style={{ color: "white", margin: "0 0 16px 0" }}>
                    Add Contact
                  </h3>
                  <input
                    type="text"
                    placeholder="Name"
                    value={newContact.name}
                    onChange={(e) =>
                      setNewContact({ ...newContact, name: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact({ ...newContact, phone: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <select
                    value={newContact.type}
                    onChange={(e) =>
                      setNewContact({ ...newContact, type: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginBottom: "15px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="Family">Family</option>
                    <option value="Doctor">Doctor</option>
                    <option value="Hospital">Hospital</option>
                  </select>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => setShowAddContact(false)}
                      style={{
                        ...styles.button("rgba(100, 116, 139, 1)"),
                        flex: 1,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addContact}
                      style={{
                        ...styles.button(
                          "linear-gradient(135deg, #ec4899, #a855f7)"
                        ),
                        flex: 1,
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Location Tab */}
        {activeTab === "location" && (
          <div>
            <h2 style={{ color: "white", margin: "0 0 20px 0" }}>
              Live Location Tracking
            </h2>
            {location ? (
              <div
                style={styles.card([
                  "rgba(34, 197, 94, 0.2)",
                  "rgba(59, 130, 246, 0.2)",
                ])}
              >
                <div style={{ color: "#a5f3fc", marginBottom: "12px" }}>
                  🔴 LIVE TRACKING ACTIVE
                </div>
                <div
                  style={{
                    color: "white",
                    fontSize: "18px",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  Current Location
                </div>
                <div style={{ color: "#c084fc", marginBottom: "4px" }}>
                  Latitude: {location.lat.toFixed(6)}
                </div>
                <div style={{ color: "#c084fc", marginBottom: "12px" }}>
                  Longitude: {location.lng.toFixed(6)}
                </div>
                <button
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps?q=${location.lat},${location.lng}`,
                      "_blank"
                    );
                  }}
                  style={{
                    ...styles.button(
                      "linear-gradient(135deg, #0ea5e9, #06b6d4)"
                    ),
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  🗺️ Open in Google Maps
                </button>
              </div>
            ) : (
              <div
                style={styles.card([
                  "rgba(220, 38, 38, 0.1)",
                  "rgba(185, 28, 28, 0.05)",
                ])}
              >
                <div style={{ color: "#fca5a5" }}>
                  ⏳ Waiting for location...
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            <h2 style={{ color: "white", marginBottom: "20px" }}>
              Medicine History
            </h2>
            {medicineHistory.length > 0 ? (
              medicineHistory.map((entry, index) => (
                <div
                  key={index}
                  style={styles.card([
                    "rgba(30, 27, 75, 0.8)",
                    "rgba(30, 41, 59, 0.8)",
                  ])}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <div>
                      <div style={{ color: "white", fontWeight: "bold" }}>
                        {entry.medicineName}
                      </div>
                      <div style={{ color: "#c084fc" }}>{entry.dose}</div>
                    </div>
                    <div style={{ color: "#86efac", fontSize: "12px" }}>
                      {entry.takenAt}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div
                style={styles.card([
                  "rgba(30, 27, 75, 0.8)",
                  "rgba(30, 41, 59, 0.8)",
                ])}
              >
                <div style={{ color: "#c084fc", textAlign: "center" }}>
                  No medicine history yet
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SOS Modal */}
      {showSOS && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              border: "2px solid #fca5a5",
              borderRadius: "12px",
              padding: "40px",
              textAlign: "center",
              maxWidth: "400px",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>🚨</div>
            <h2 style={{ color: "white", margin: "0 0 16px 0" }}>
              EMERGENCY SOS
            </h2>
            <p style={{ color: "#fca5a5", marginBottom: "20px" }}>
              Will call emergency contact
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
  
            {/* Cancel */}
            <button
              onClick={() => setShowSOS(false)}
              style={{ ...styles.button("rgba(100, 116, 139, 1)"), flex: 1 }}
            >
              Cancel
            </button>
          
            {/* Trigger SOS */}
            <button
              onClick={triggerSOS}
              style={{
                ...styles.button("linear-gradient(135deg, #22c55e, #16a34a)"),
                flex: 1,
                fontWeight: "bold",
              }}
            >
              🚨 SOS
            </button>
          
          </div>
          
          {/* 🔥 NOW ADD THIS OUTSIDE */}
          {/* 🔥 EMERGENCY ACTIONS OUTSIDE */}
<div
style={{
  marginTop: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
}}
>
{/* WhatsApp */}
<button
  onClick={sendWhatsAppAlert}
  style={styles.button("linear-gradient(135deg, #25D366, #128C7E)")}
>
  📲 Send WhatsApp Alert
</button>

{/* Nearby Hospitals */}
<button
  onClick={findNearbyHospitals}
  style={styles.button("linear-gradient(135deg, #ff9966, #ff5e62)")}
>
  🏥 Find Nearby Hospitals
</button>

{/* Call Ambulance */}
<a href="tel:102">
  <button
    style={styles.button("linear-gradient(135deg, #ff3b3b, #c70039)")}
  >
    🚑 Call Ambulance
  </button>
</a>
</div>
    

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default CareDemApp;
