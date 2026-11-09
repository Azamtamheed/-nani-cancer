import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  Pill,
  Utensils,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Edit2,
  Share2,
  AlertTriangle,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  HeartHandshake,
  Stethoscope,
  Package,
  Info,
  Check,
  X,
  Sparkles,
  ClipboardList,
  Camera,
  Eye,
  Smartphone,
  ShieldAlert,
  Upload,
  Minus,
  ExternalLink,
  QrCode
} from 'lucide-react';

// --- FIREBASE INITIALIZATION (STRICT RULES 1, 2, 3) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'grandma-care-app';

// Helper to get local YYYY-MM-DD
const getLocalDateString = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Format 24h time string ("08:00") to readable 12h ("08:00 AM")
const formatTime12h = (time24) => {
  if (!time24) return 'Anytime';
  const [h, m] = time24.split(':');
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return time24;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${m} ${ampm}`;
};

// Compress uploaded camera/gallery image via HTML5 Canvas so it stays <60KB and syncs fast in Firestore
const compressImageToBase64 = (file, maxWidth = 480, quality = 0.62) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        // Ensure under ~60KB
        if (dataUrl.length > 75000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.45);
        }
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// --- MASTER CATALOG OF 10 UNIQUE MEDICINES (FOR SHARED PHOTO & PILL STOCK) ---
const INITIAL_MED_CATALOG = [
  {
    medKey: 'pantop40',
    name: 'Pantop 40',
    subtitle: 'Pantoprazole 40 mg (Empty Stomach)',
    visualType: 'strip-yellow',
    unit: 'tablets',
    stock: 30,
    lowThreshold: 5
  },
  {
    medKey: 'mucaine',
    name: 'Mucaine Gel',
    subtitle: 'Antacid Gel (Before Meals)',
    visualType: 'bottle-mint',
    unit: 'doses',
    stock: 40,
    lowThreshold: 6
  },
  {
    medKey: 'telvas40',
    name: 'Telvas 40',
    subtitle: 'Telmisartan 40 mg (9:30 AM)',
    visualType: 'strip-blue',
    unit: 'tablets',
    stock: 30,
    lowThreshold: 5
  },
  {
    medKey: 'addna',
    name: 'Addna',
    subtitle: 'Half (½) Tablet (9:35 AM & 8:30 PM)',
    visualType: 'half-pill-amber',
    unit: 'tablets',
    stock: 20,
    lowThreshold: 4
  },
  {
    medKey: 'dexamethasone',
    name: 'Dexamethasone',
    subtitle: '1 Tablet (9:35 AM after Addna)',
    visualType: 'strip-white',
    unit: 'tablets',
    stock: 25,
    lowThreshold: 5
  },
  {
    medKey: 'chymofort',
    name: 'Chymoral Forte (Chymofort)',
    subtitle: '1 Tablet (9:35 AM & 8:35 PM)',
    visualType: 'strip-red',
    unit: 'tablets',
    stock: 30,
    lowThreshold: 6
  },
  {
    medKey: 'coughsyrup',
    name: 'Cough Syrup',
    subtitle: 'Syrup (10:00 AM, 2:40 PM, 8:50 PM)',
    visualType: 'bottle-amber',
    unit: 'doses',
    stock: 35,
    lowThreshold: 6
  },
  {
    medKey: 'natrise',
    name: 'Natrise (Tolvaptan)',
    subtitle: 'Half (½) Tablet at 10:15 AM',
    visualType: 'half-pill-teal',
    unit: 'tablets',
    stock: 15,
    lowThreshold: 3
  },
  {
    medKey: 'mirago50',
    name: 'Mirago 50',
    subtitle: 'Mirabegron 50 mg (2:30 PM)',
    visualType: 'strip-gold',
    unit: 'tablets',
    stock: 30,
    lowThreshold: 5
  },
  {
    medKey: 'lenvatinib',
    name: 'Lenvatinib 4 mg',
    subtitle: 'Target Therapy (4 Caps = 16 mg at 10 PM)',
    visualType: 'capsules-4',
    unit: 'capsules',
    stock: 60,
    lowThreshold: 12
  }
];

// --- FINALIZED 19-STEP DAILY TIMETABLE (NARRATED BY MAMA) ---
const INITIAL_19_SCHEDULE = [
  {
    id: 'step-01',
    order: 1,
    time: '08:00',
    period: 'Morning',
    name: 'Pantop 40 (Pantoprazole 40 mg)',
    medKey: 'pantop40',
    dosage: '1 Tablet (Empty stomach)',
    category: 'Medication',
    instructions: 'Give early morning on an empty stomach before breakfast.',
    decrementBy: 1,
    visualType: 'strip-yellow'
  },
  {
    id: 'step-02',
    order: 2,
    time: '08:45',
    period: 'Morning',
    name: 'Mucaine Gel (Antacid Gel)',
    medKey: 'mucaine',
    dosage: 'Syrup / Gel (Before breakfast)',
    category: 'Medication',
    instructions: 'Give before breakfast to coat and soothe throat and stomach.',
    decrementBy: 1,
    visualType: 'bottle-mint'
  },
  {
    id: 'step-03',
    order: 3,
    time: '09:00',
    period: 'Morning',
    name: 'Breakfast',
    medKey: 'meal_breakfast',
    dosage: 'Morning Meal (Soft/liquid diet as tolerated)',
    category: 'Diet / Meal',
    instructions: 'Soft, lukewarm, easy-to-swallow morning breakfast.',
    decrementBy: 0,
    visualType: 'meal-breakfast'
  },
  {
    id: 'step-04',
    order: 4,
    time: '09:30',
    period: 'Morning',
    name: 'Telvas 40 (Telmisartan 40 mg)',
    medKey: 'telvas40',
    dosage: '1 Tablet (After breakfast)',
    category: 'Medication',
    instructions: 'Take at 9:30 AM after finishing breakfast.',
    decrementBy: 1,
    visualType: 'strip-blue'
  },
  {
    id: 'step-05',
    order: 5,
    time: '09:35',
    period: 'Morning',
    name: 'Addna',
    medKey: 'addna',
    dosage: 'Half (½) Tablet (5 mins after Telvas 40)',
    category: 'Medication',
    instructions: 'Give HALF (½) tablet of Addna 5 minutes after Telvas 40.',
    decrementBy: 0.5,
    visualType: 'half-pill-amber'
  },
  {
    id: 'step-06',
    order: 6,
    time: '09:35',
    period: 'Morning',
    name: 'Dexamethasone',
    medKey: 'dexamethasone',
    dosage: '1 Tablet (After Addna)',
    category: 'Medication',
    instructions: 'Give 1 tablet right after Addna.',
    decrementBy: 1,
    visualType: 'strip-white'
  },
  {
    id: 'step-07',
    order: 7,
    time: '09:35',
    period: 'Morning',
    name: 'Chymoral Forte (Chymofort)',
    medKey: 'chymofort',
    dosage: '1 Tablet',
    category: 'Medication',
    instructions: 'Give 1 tablet at 9:35 AM for throat swelling/inflammation.',
    decrementBy: 1,
    visualType: 'strip-red'
  },
  {
    id: 'step-08',
    order: 8,
    time: '10:00',
    period: 'Morning',
    name: 'Cough Syrup',
    medKey: 'coughsyrup',
    dosage: 'Syrup (15–20 mins after pills; avoid water right after)',
    category: 'Medication',
    instructions: 'Give 15–20 minutes after morning tablets. Avoid drinking water immediately after.',
    decrementBy: 1,
    visualType: 'bottle-amber'
  },
  {
    id: 'step-09',
    order: 9,
    time: '10:15',
    period: 'Morning',
    name: 'Natrise (Tolvaptan)',
    medKey: 'natrise',
    dosage: 'Half (½) Tablet (Completes morning medication)',
    category: 'Medication',
    instructions: 'Give HALF (½) tablet at 10:15 AM. Completes morning medication routine!',
    decrementBy: 0.5,
    visualType: 'half-pill-teal'
  },
  {
    id: 'step-10',
    order: 10,
    time: '12:45',
    period: 'Afternoon',
    name: 'Mucaine Gel (Antacid Gel)',
    medKey: 'mucaine',
    dosage: 'Syrup / Gel (Before lunch)',
    category: 'Medication',
    instructions: 'Take first right BEFORE going for lunch.',
    decrementBy: 1,
    visualType: 'bottle-mint'
  },
  {
    id: 'step-11',
    order: 11,
    time: '13:00',
    period: 'Afternoon',
    name: 'Lunch',
    medKey: 'meal_lunch',
    dosage: 'Afternoon Meal',
    category: 'Diet / Meal',
    instructions: '1:00 PM Afternoon Lunch (after taking Mucaine Gel).',
    decrementBy: 0,
    visualType: 'meal-lunch'
  },
  {
    id: 'step-12',
    order: 12,
    time: '14:30',
    period: 'Afternoon',
    name: 'Mirago 50 (Mirabegron 50 mg)',
    medKey: 'mirago50',
    dosage: '1 Tablet',
    category: 'Medication',
    instructions: 'Give 1 tablet at 2:30 PM (Only Mirago 50 — no Addna at 2:30 PM).',
    decrementBy: 1,
    visualType: 'strip-gold'
  },
  {
    id: 'step-13',
    order: 13,
    time: '14:40',
    period: 'Afternoon',
    name: 'Cough Syrup',
    medKey: 'coughsyrup',
    dosage: 'Syrup (After Mirago 50)',
    category: 'Medication',
    instructions: 'Give afternoon dose of Cough Syrup after Mirago 50.',
    decrementBy: 1,
    visualType: 'bottle-amber'
  },
  {
    id: 'step-14',
    order: 14,
    time: '19:45',
    period: 'Night',
    name: 'Mucaine Gel (Antacid Gel)',
    medKey: 'mucaine',
    dosage: 'Syrup / Gel (Before dinner)',
    category: 'Medication',
    instructions: 'Give BEFORE dinner.',
    decrementBy: 1,
    visualType: 'bottle-mint'
  },
  {
    id: 'step-15',
    order: 15,
    time: '20:00',
    period: 'Night',
    name: 'Dinner',
    medKey: 'meal_dinner',
    dosage: 'Evening Meal',
    category: 'Diet / Meal',
    instructions: 'Evening Dinner (after taking Mucaine Gel).',
    decrementBy: 0,
    visualType: 'meal-dinner'
  },
  {
    id: 'step-16',
    order: 16,
    time: '20:30',
    period: 'Night',
    name: 'Addna',
    medKey: 'addna',
    dosage: 'Half (½) Tablet (After dinner)',
    category: 'Medication',
    instructions: 'Give HALF (½) tablet of Addna AFTER dinner.',
    decrementBy: 0.5,
    visualType: 'half-pill-amber'
  },
  {
    id: 'step-17',
    order: 17,
    time: '20:35',
    period: 'Night',
    name: 'Chymoral Forte (Chymofort)',
    medKey: 'chymofort',
    dosage: '1 Tablet (After dinner)',
    category: 'Medication',
    instructions: 'Give 1 tablet after dinner.',
    decrementBy: 1,
    visualType: 'strip-red'
  },
  {
    id: 'step-18',
    order: 18,
    time: '20:50',
    period: 'Night',
    name: 'Cough Syrup',
    medKey: 'coughsyrup',
    dosage: 'Syrup (15 mins after pills)',
    category: 'Medication',
    instructions: 'Give night dose of Cough Syrup 15 minutes after dinner pills.',
    decrementBy: 1,
    visualType: 'bottle-amber'
  },
  {
    id: 'step-19',
    order: 19,
    time: '22:00',
    period: 'Night',
    name: 'Lenvatinib 4 mg (Target Therapy)',
    medKey: 'lenvatinib',
    dosage: '4 Capsules at once (16 mg total) - Fixed Time',
    category: 'Target Therapy',
    instructions: 'CRITICAL TARGET THERAPY: Give FOUR (4) capsules of 4 mg together at 10:00 PM fixed time.',
    decrementBy: 4,
    visualType: 'capsules-4'
  }
];

const SAMPLE_APPOINTMENTS = [
const CAREGIVER_ROLES = ['Mom (Mama)', 'Dad (Papa)', 'Family Member', 'Nurse', 'Grandchild'];

// --- ILLUSTRATED SVG MEDICINE THUMBNAIL COMPONENT (WITH CUSTOM PHOTO SUPPORT) ---
function MedicineVisualBadge({ item, customPhotoUrl, onClickPhoto }) {
  const isMeal =
    item.category === 'Meal' ||
    item.category === 'Diet / Meal' ||
    (item.medKey && item.medKey.startsWith('meal_'));

  if (customPhotoUrl) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClickPhoto(item);
        }}
        className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-teal-600 shadow-sm shrink-0 bg-stone-100 group cursor-pointer"
        title="Tap to inspect full screen or replace photo"
      >
        <img
          src={customPhotoUrl}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-105 transition"
        />
        <div className="absolute inset-x-0 bottom-0 bg-stone-950/80 text-white text-[10px] font-bold py-1 px-1.5 flex items-center justify-center gap-1">
          <Eye className="w-3 h-3 text-amber-300" />
          <span>Zoom / Photo</span>
        </div>
      </div>
    );
  }

  if (isMeal) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClickPhoto(item);
        }}
        className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-amber-100 border-2 border-amber-300 flex flex-col items-center justify-center p-2 text-center shrink-0 cursor-pointer hover:border-amber-500 transition"
        title="Tap to add meal/diet reference photo"
      >
        <Utensils className="w-8 h-8 text-amber-700 mb-1" />
        <span className="text-xs font-extrabold text-amber-950 leading-tight">{item.name}</span>
        <span className="text-[9px] font-bold text-amber-800 mt-0.5 line-clamp-1">Soft Diet</span>
      </div>
    );
  }

  // Realistic Color-Coded SVG Medicine Packaging Preview + Camera Upload Prompt
  const renderPackagingGraphic = () => {
    switch (item.visualType) {
      case 'strip-yellow':
        return (
          <div className="w-full h-full bg-gradient-to-br from-amber-100 to-yellow-200 flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-amber-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded mb-1 uppercase">
              PANTOP 40
            </div>
            <svg viewBox="0 0 80 34" className="w-16 h-8 drop-shadow-xs">
              <rect x="2" y="2" width="76" height="30" rx="5" fill="#d97706" stroke="#b45309" strokeWidth="1.5" />
              <ellipse cx="22" cy="17" rx="10" ry="6" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
              <ellipse cx="58" cy="17" rx="10" ry="6" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
            </svg>
            <span className="text-[9px] font-extrabold text-amber-950">1 Tab Empty</span>
          </div>
        );
      case 'bottle-mint':
        return (
          <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-teal-200 flex flex-col items-center justify-center p-1.5 text-center">
            <svg viewBox="0 0 44 54" className="w-10 h-12 drop-shadow-xs">
              <rect x="14" y="2" width="16" height="7" rx="2" fill="#f472b6" />
              <path d="M12 10 H32 L36 18 V48 C36 50 34 52 32 52 H12 C10 52 8 50 8 48 V18 Z" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
              <rect x="11" y="22" width="22" height="16" rx="2" fill="#ccfbf1" />
              <text x="22" y="32" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#0f766e">MUCAINE</text>
            </svg>
            <span className="text-[10px] font-extrabold text-teal-950 leading-tight">Mucaine Gel</span>
          </div>
        );
      case 'strip-blue':
        return (
          <div className="w-full h-full bg-gradient-to-br from-sky-100 to-blue-200 flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-blue-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded mb-1">
              TELVAS 40
            </div>
            <svg viewBox="0 0 80 34" className="w-16 h-8 drop-shadow-xs">
              <rect x="2" y="2" width="76" height="30" rx="5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="22" cy="17" r="8" fill="#ffffff" stroke="#2563eb" strokeWidth="2" />
              <circle cx="58" cy="17" r="8" fill="#ffffff" stroke="#2563eb" strokeWidth="2" />
            </svg>
            <span className="text-[9px] font-extrabold text-blue-950">1 Tablet</span>
          </div>
        );
      case 'half-pill-amber':
      case 'half-pill-teal':
        return (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-200 flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-red-700 text-white text-[9px] font-black px-2 py-0.5 rounded-full mb-1 shadow-xs">
              ½ HALF TAB
            </div>
            <svg viewBox="0 0 64 32" className="w-14 h-7">
              <path d="M24 4 A12 12 0 0 0 24 28 Z" fill="#ffffff" stroke="#1c1917" strokeWidth="2" />
              <path d="M36 4 A12 12 0 0 1 36 28 Z" fill="#e7e5e4" stroke="#78716c" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span className="text-[10px] font-extrabold text-stone-900 leading-tight">
              {item.medKey === 'addna' ? 'Addna (½)' : 'Natrise (½)'}
            </span>
          </div>
        );
      case 'strip-red':
        return (
          <div className="w-full h-full bg-gradient-to-br from-rose-100 to-red-200 flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-red-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded mb-1 uppercase">
              CHYMOFORT
            </div>
            <svg viewBox="0 0 80 34" className="w-16 h-8 drop-shadow-xs">
              <rect x="2" y="2" width="76" height="30" rx="5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
              <circle cx="22" cy="17" r="8" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" />
              <circle cx="58" cy="17" r="8" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" />
            </svg>
            <span className="text-[9px] font-extrabold text-red-950">1 Tablet</span>
          </div>
        );
      case 'bottle-amber':
        return (
          <div className="w-full h-full bg-gradient-to-br from-amber-100 to-orange-200 flex flex-col items-center justify-center p-1.5 text-center">
            <svg viewBox="0 0 44 54" className="w-10 h-12 drop-shadow-xs">
              <rect x="14" y="2" width="16" height="7" rx="2" fill="#ffffff" stroke="#78350f" strokeWidth="1" />
              <path d="M12 10 H32 L36 18 V48 C36 50 34 52 32 52 H12 C10 52 8 50 8 48 V18 Z" fill="#92400e" stroke="#fef3c7" strokeWidth="1.5" />
              <rect x="11" y="22" width="22" height="15" rx="2" fill="#fef3c7" />
              <text x="22" y="32" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#78350f">SYRUP</text>
            </svg>
            <span className="text-[10px] font-extrabold text-amber-950 leading-tight">Cough Syrup</span>
          </div>
        );
      case 'strip-gold':
        return (
          <div className="w-full h-full bg-gradient-to-br from-yellow-100 to-amber-200 flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-stone-900 text-amber-300 text-[8px] font-black px-1.5 py-0.5 rounded mb-1">
              MIRAGO 50
            </div>
            <svg viewBox="0 0 80 34" className="w-16 h-8 drop-shadow-xs">
              <rect x="2" y="2" width="76" height="30" rx="5" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
              <ellipse cx="22" cy="17" rx="9" ry="5.5" fill="#f59e0b" stroke="#78350f" strokeWidth="1.5" />
              <ellipse cx="58" cy="17" rx="9" ry="5.5" fill="#f59e0b" stroke="#78350f" strokeWidth="1.5" />
            </svg>
            <span className="text-[9px] font-extrabold text-stone-900">1 Tab (2:30 PM)</span>
          </div>
        );
      case 'capsules-4':
        return (
          <div className="w-full h-full bg-gradient-to-br from-purple-900 to-indigo-950 text-white flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-amber-400 text-stone-950 text-[8px] font-black px-1.5 py-0.5 rounded mb-1">
              4 CAPS (16mg)
            </div>
            <div className="grid grid-cols-2 gap-1 my-0.5">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className="w-6 h-2.5 rounded-full bg-gradient-to-r from-red-500 to-amber-200 border border-white/70"
                />
              ))}
            </div>
            <span className="text-[9px] font-bold text-amber-200 leading-tight">Lenvatinib 4mg</span>
          </div>
        );
      default:
        return (
          <div className="w-full h-full bg-gradient-to-br from-stone-100 to-stone-200 flex flex-col items-center justify-center p-1.5 text-center">
            <div className="bg-stone-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded mb-1">
              DEXA TAB
            </div>
            <svg viewBox="0 0 80 34" className="w-16 h-8 drop-shadow-xs">
              <rect x="2" y="2" width="76" height="30" rx="5" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="22" cy="17" r="7" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />
              <circle cx="58" cy="17" r="7" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />
            </svg>
            <span className="text-[9px] font-extrabold text-stone-800 leading-tight line-clamp-1">
              1 Tablet
            </span>
          </div>
        );
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClickPhoto(item);
      }}
      className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-stone-300 hover:border-teal-600 shadow-xs shrink-0 cursor-pointer group transition"
      title="Tap to upload your actual photo of this medicine"
    >
      {renderPackagingGraphic()}
      <div className="absolute inset-x-0 bottom-0 bg-stone-900/85 group-hover:bg-teal-800 text-white text-[10px] font-bold py-1 px-1 flex items-center justify-center gap-1 transition">
        <Camera className="w-3 h-3 text-amber-300 shrink-0" />
        <span>Camera / Photo</span>
      </div>
    </div>
  );
}

export default function App() {
  // Auth & Sync State
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null);

  // Caregiver Identity (Quick Switcher)
  const [activeCaregiver, setActiveCaregiver] = useState('Mom (Mama)');
  const [customCaregiverName, setCustomCaregiverName] = useState('');
  const [isEditingCaregiver, setIsEditingCaregiver] = useState(false);

  // Navigation & Date State
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'meds' | 'appts'
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString(new Date()));
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'Morning' | 'Afternoon' | 'Night'

  // Firestore Collections State
  const [scheduleSteps, setScheduleSteps] = useState([]);
  const [medCatalog, setMedCatalog] = useState({}); // { [medKey]: { name, stock, photoUrl, ... } }
  const [appointments, setAppointments] = useState([]);
  const [dailyLogs, setDailyLogs] = useState({}); // { "YYYY-MM-DD": { items: { [stepId]: { done, by, at } } } }

  // Modals & Notifications
  const [modalOpen, setModalOpen] = useState(null); // 'photo' | 'add-step' | 'add-appt' | 'share' | 'confirm-reset'
  const [selectedPhotoItem, setSelectedPhotoItem] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [editingAppt, setEditingAppt] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const fileInputRef = useRef(null);

  // Step Form State
  const [stepForm, setStepForm] = useState({
    name: '',
    dosage: '1 Tablet',
    time: '08:00',
    period: 'Morning',
    category: 'Medication',
    medKey: 'pantop-40',
    instructions: '',
    decrementBy: 1
  });

  // Appointment Form State
  const [apptForm, setApptForm] = useState({
    title: '',
    doctor: '',
    location: '',
    date: getLocalDateString(new Date()),
    time: '11:00',
    notes: ''
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3600);
  };

  // --- 1. FIREBASE AUTHENTICATION (RULE 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Auth error:', err);
        setSyncError('Could not connect to live cloud sync. Check internet connection.');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. FIREBASE REALTIME LISTENERS & V2 SEEDING (RULES 1 & 2) ---
  useEffect(() => {
    if (!user) return;

    const stepsRef = collection(db, 'artifacts', appId, 'public', 'data', 'scheduleSteps');
    const catalogRef = collection(db, 'artifacts', appId, 'public', 'data', 'medCatalog');
    const apptsRef = collection(db, 'artifacts', appId, 'public', 'data', 'appointments');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'dailyLogs');
    const metaRef = collection(db, 'artifacts', appId, 'public', 'data', 'workspaceMeta');

    // Seed the finalized 19-step timetable narrated by Mama if v3 seed hasn't run yet
    const unsubMeta = onSnapshot(
      metaRef,
      async (snapshot) => {
        const seededV3 = snapshot.docs.find((d) => d.id === 'seedStatusV3');
        if (!seededV3) {
          try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'workspaceMeta', 'seedStatusV3'), {
              seeded: true,
              seededAt: Date.now(),
              version: 'mama-19-step-v3'
            });
            for (const cat of INITIAL_MED_CATALOG) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'medCatalog', cat.medKey), cat, {
                merge: true
              });
            }
            for (const step of INITIAL_19_SCHEDULE) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scheduleSteps', step.id), step);
            }
            for (const appt of SAMPLE_APPOINTMENTS) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', appt.id), appt);
            }
          } catch (e) {
            console.error('Error seeding 19-step schedule:', e);
          }
        }
      },
      (err) => console.error('Meta listener error:', err)
    );

    const unsubSteps = onSnapshot(
      stepsRef,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const timeCmp = (a.time || '').localeCompare(b.time || '');
          if (timeCmp !== 0) return timeCmp;
          return (a.order || 0) - (b.order || 0);
        });
        setScheduleSteps(list);
        setLoading(false);
      },
      (err) => {
        console.error('Steps listener error:', err);
        setSyncError('Live sync interrupted.');
      }
    );

    const unsubCatalog = onSnapshot(
      catalogRef,
      (snapshot) => {
        const map = {};
        snapshot.docs.forEach((d) => {
          map[d.id] = { medKey: d.id, ...d.data() };
        });
        setMedCatalog(map);
      },
      (err) => console.error('Catalog listener error:', err)
    );

    const unsubAppts = onSnapshot(
      apptsRef,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        setAppointments(list);
      },
      (err) => console.error('Appts listener error:', err)
    );

    const unsubLogs = onSnapshot(
      logsRef,
      (snapshot) => {
        const logsMap = {};
        snapshot.docs.forEach((d) => {
          logsMap[d.id] = d.data();
        });
        setDailyLogs(logsMap);
      },
      (err) => console.error('Logs listener error:', err)
    );

    return () => {
      unsubMeta();
      unsubSteps();
      unsubCatalog();
      unsubAppts();
      unsubLogs();
    };
  }, [user]);

  const getPeriodFromTime = (timeStr) => {
    if (!timeStr) return 'Morning';
    const hour = parseInt(timeStr.split(':')[0], 10);
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Night';
  };

  // --- TOGGLE DAILY STEP COMPLETION + AUTO-ADJUST STOCK ---
  const handleToggleDailyStep = async (step) => {
    if (!user) return;
    const dateKey = selectedDate;
    const currentDayLog = dailyLogs[dateKey]?.items || {};
    const existingStatus = currentDayLog[step.id];
    const isNowDone = !existingStatus?.done;

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedItems = {
      ...currentDayLog,
      [step.id]: isNowDone
        ? {
            done: true,
            by: activeCaregiver,
            at: nowTime,
            timestamp: Date.now()
          }
        : {
            done: false,
            by: null,
            at: null
          }
    };

    try {
      const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'dailyLogs', dateKey);
      await setDoc(logDocRef, { items: updatedItems, updatedAt: Date.now() }, { merge: true });

      // Automatically decrement/increment stock in medCatalog if linked to a medicine
      if (step.medKey && medCatalog[step.medKey]) {
        const currentStock = Number(medCatalog[step.medKey].stock) || 0;
        const dec = Number(step.decrementBy) || 1;
        const newStock = isNowDone
          ? Math.max(0, Number((currentStock - dec).toFixed(1)))
          : Number((currentStock + dec).toFixed(1));
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'medCatalog', step.medKey), {
          stock: newStock
        });
      }

      if (isNowDone) {
        showToast(`✓ Marked "${step.name}" as given by ${activeCaregiver}`);
      } else {
        showToast(`Unchecked "${step.name}"`);
      }
    } catch (err) {
      console.error('Error toggling step:', err);
      showToast('Could not save change. Please check connection.');
    }
  };

  // --- UPLOAD / REPLACE MEDICINE PHOTO FROM PHONE CAMERA ---
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedPhotoItem) return;

    setUploadingPhoto(true);
    try {
      const compressedBase64 = await compressImageToBase64(file, 600, 0.72);

      // Save to medCatalog if this step shares a medicine key (e.g. Mucaine Gel, Addna, Cough Syrup)
      if (selectedPhotoItem.medKey) {
        await setDoc(
          doc(db, 'artifacts', appId, 'public', 'data', 'medCatalog', selectedPhotoItem.medKey),
          {
            photoUrl: compressedBase64,
            photoUpdatedBy: activeCaregiver,
            photoUpdatedAt: Date.now()
          },
          { merge: true }
        );
      } else {
        // Otherwise save directly on the schedule step
        await updateDoc(
          doc(db, 'artifacts', appId, 'public', 'data', 'scheduleSteps', selectedPhotoItem.id),
          {
            photoUrl: compressedBase64
          }
        );
      }

      showToast(`Updated photo for ${selectedPhotoItem.name}! Synced to all family phones.`);
    } catch (err) {
      console.error('Error uploading photo:', err);
      showToast('Could not upload image. Please try another photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveCustomPhoto = async () => {
    if (!user || !selectedPhotoItem) return;
    try {
      if (selectedPhotoItem.medKey) {
        await updateDoc(
          doc(db, 'artifacts', appId, 'public', 'data', 'medCatalog', selectedPhotoItem.medKey),
          { photoUrl: null }
        );
      } else {
        await updateDoc(
          doc(db, 'artifacts', appId, 'public', 'data', 'scheduleSteps', selectedPhotoItem.id),
          { photoUrl: null }
        );
      }
      showToast('Reverted to default illustration.');
    } catch (err) {
      console.error('Error removing photo:', err);
    }
  };

  // --- SAVE / EDIT SCHEDULE STEP ---
  const handleSaveStep = async (e) => {
    e.preventDefault();
    if (!user || !stepForm.name.trim()) return;
    const id = editingStep ? editingStep.id : `step-${Date.now()}`;
    const period = getPeriodFromTime(stepForm.time);
    const payload = {
      ...stepForm,
      id,
      period,
      order: editingStep ? editingStep.order || 99 : 99,
      decrementBy: stepForm.category === 'Meal' ? 0 : Number(stepForm.decrementBy) || 1,
      medKey: stepForm.category === 'Meal' ? null : stepForm.medKey || null,
      updatedAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scheduleSteps', id), payload, {
        merge: true
      });
      setModalOpen(null);
      setEditingStep(null);
      showToast(editingStep ? 'Schedule step updated!' : 'New daily step added!');
    } catch (err) {
      console.error('Error saving step:', err);
    }
  };

  // --- ADJUST / RESTOCK MEDICINE ---
  const handleRestockMed = async (medKey, deltaAmount = 10) => {
    if (!user || !medCatalog[medKey]) return;
    try {
      const current = Number(medCatalog[medKey].stock) || 0;
      const newStock = Math.max(0, Number((current + deltaAmount).toFixed(1)));
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'medCatalog', medKey), {
        stock: newStock
      });
      const sign = deltaAmount > 0 ? `+${deltaAmount}` : `${deltaAmount}`;
      showToast(`Updated ${medCatalog[medKey].name} (${sign} → Total: ${newStock})`);
    } catch (err) {
      console.error('Error restocking:', err);
    }
  };

  // --- RESET DAY CHECKLIST ---
  const handleResetDay = async () => {
    if (!user) return;
    try {
      const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'dailyLogs', selectedDate);
      await setDoc(logDocRef, { items: {}, updatedAt: Date.now() });
      setModalOpen(null);
      showToast(`Reset all checkmarks for ${selectedDate}`);
    } catch (err) {
      console.error('Error resetting day:', err);
    }
  };

  // --- SAVE / EDIT APPOINTMENT ---
  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    if (!user || !apptForm.title.trim()) return;
    const id = editingAppt ? editingAppt.id : `appt-${Date.now()}`;
    const payload = {
      ...apptForm,
      id,
      completed: editingAppt ? Boolean(editingAppt.completed) : false,
      updatedAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', id), payload);
      setModalOpen(null);
      setEditingAppt(null);
      showToast(editingAppt ? 'Appointment updated!' : 'Appointment scheduled!');
    } catch (err) {
      console.error('Error saving appointment:', err);
    }
  };

  const handleToggleApptCompleted = async (appt) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', appt.id), {
        completed: !appt.completed,
        completedBy: !appt.completed ? activeCaregiver : null
      });
      showToast(!appt.completed ? 'Appointment marked complete!' : 'Appointment reopened');
    } catch (err) {
      console.error('Error toggling appt:', err);
    }
  };

  const handleDeleteDoc = async (collectionName, id, label) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, id));
      showToast(`Deleted "${label}"`);
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  // --- SHARE LINK & WHATSAPP STATUS REPORT ---
  const handleCopyShareLink = () => {
    const shareUrl = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Website Link Copied! Paste it in your Family WhatsApp Group.');
      });
    } else {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast('Website Link Copied! Paste it in your Family WhatsApp Group.');
    }
  };

  const handleSendWhatsAppReport = () => {
    const currentLogs = dailyLogs[selectedDate]?.items || {};
    const doneCount = scheduleSteps.filter((s) => currentLogs[s.id]?.done).length;

    let report = `*Grandma's Daily Medication & Care Log (${selectedDate})*\n`;
    report += `✅ Completed: *${doneCount} of ${scheduleSteps.length}* steps\n\n`;

    scheduleSteps.forEach((step) => {
      const status = currentLogs[step.id];
      if (status?.done) {
        report += `✅ *${formatTime12h(step.time)}* - ${step.name} (${step.dosage}) — _Given by ${status.by} at ${status.at}_\n`;
      } else {
        report += `⏳ *${formatTime12h(step.time)}* - ${step.name} (${step.dosage}) — *PENDING*\n`;
      }
    });

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(report)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // --- DATE NAVIGATION ---
  const shiftDate = (days) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    setSelectedDate(getLocalDateString(dateObj));
  };

  const isTodaySelected = selectedDate === getLocalDateString(new Date());

  const formattedSelectedDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, [selectedDate]);

  const filteredSchedule = useMemo(() => {
    if (timeFilter === 'ALL') return scheduleSteps;
    return scheduleSteps.filter((s) => (s.period || getPeriodFromTime(s.time)) === timeFilter);
  }, [scheduleSteps, timeFilter]);

  const currentDayCompletionMap = dailyLogs[selectedDate]?.items || {};
  const totalDailyCount = scheduleSteps.length;
  const completedDailyCount = useMemo(() => {
    return scheduleSteps.filter((s) => currentDayCompletionMap[s.id]?.done).length;
  }, [scheduleSteps, currentDayCompletionMap]);

  const progressPercentage =
    totalDailyCount > 0 ? Math.round((completedDailyCount / totalDailyCount) * 100) : 0;

  const catalogList = useMemo(() => {
    return INITIAL_MED_CATALOG.map((base) => ({
      ...base,
      ...(medCatalog[base.medKey] || {})
    }));
  }, [medCatalog]);

  const lowStockMeds = useMemo(() => {
    return catalogList.filter((m) => Number(m.stock) <= (m.lowThreshold || 5));
  }, [catalogList]);

  // Active photo URL for currently opened photo modal
  const activeModalPhotoUrl = useMemo(() => {
    if (!selectedPhotoItem) return null;
    if (selectedPhotoItem.medKey && medCatalog[selectedPhotoItem.medKey]?.photoUrl) {
      return medCatalog[selectedPhotoItem.medKey].photoUrl;
    }
    return selectedPhotoItem.photoUrl || null;
  }, [selectedPhotoItem, medCatalog]);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 pb-28 font-sans">
      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md bg-stone-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-stone-700 animate-bounce">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          <span className="text-sm sm:text-base font-bold">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header className="bg-teal-950 text-white shadow-md sticky top-0 z-30 border-b border-teal-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-teal-800 p-2.5 rounded-2xl border border-teal-600 shadow-inner">
                <HeartHandshake className="w-7 h-7 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                    Grandma&apos;s Daily Care
                  </h1>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Live Cloud
                  </span>
                </div>
                <p className="text-xs text-teal-200">
                  19-Step Daily Timetable • Tap any medicine image to upload your strip photo
                </p>
              </div>
            </div>

            <button
              onClick={() => setModalOpen('share')}
              className="sm:hidden bg-amber-400 hover:bg-amber-300 text-stone-950 font-extrabold px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              Share Link
            </button>
          </div>

          {/* Caregiver Role Switcher & Desktop Share Button */}
          <div className="flex items-center justify-between sm:justify-end gap-2 bg-teal-900/70 px-3 py-2 rounded-xl border border-teal-800">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-teal-200 text-xs">Ticking as:</span>
              {!isEditingCaregiver ? (
                <select
                  value={activeCaregiver}
                  onChange={(e) => {
                    if (e.target.value === 'CUSTOM') {
                      setIsEditingCaregiver(true);
                    } else {
                      setActiveCaregiver(e.target.value);
                    }
                  }}
                  className="bg-teal-950 text-white font-bold px-2.5 py-1 rounded-lg border border-teal-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {CAREGIVER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                  {!CAREGIVER_ROLES.includes(activeCaregiver) && (
                    <option value={activeCaregiver}>{activeCaregiver}</option>
                  )}
                  <option value="CUSTOM">+ Custom Name...</option>
                </select>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Your name"
                    value={customCaregiverName}
                    onChange={(e) => setCustomCaregiverName(e.target.value)}
                    className="bg-white text-stone-900 px-2 py-1 rounded-lg text-sm w-28 font-bold"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (customCaregiverName.trim()) {
                        setActiveCaregiver(customCaregiverName.trim());
                      }
                      setIsEditingCaregiver(false);
                    }}
                    className="bg-emerald-500 p-1 rounded-lg text-white"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setModalOpen('share')}
              className="hidden sm:flex bg-amber-400 hover:bg-amber-300 text-stone-950 font-extrabold px-3.5 py-1.5 rounded-xl items-center gap-1.5 text-sm shadow-sm transition"
            >
              <Share2 className="w-4 h-4" />
              Share Link
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 pt-4 space-y-5">
        {/* HOSTED SHAREABLE LINK & LIVE FAMILY SYNC BANNER */}
        <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 text-white rounded-3xl p-4 sm:p-5 shadow-md border border-teal-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 bg-amber-400/20 text-amber-300 border border-amber-300/30 px-2.5 py-0.5 rounded-full text-xs font-extrabold">
              <Smartphone className="w-3.5 h-3.5" />
              Shared Family Link &amp; Live Phone Sync
            </div>
            <h2 className="text-base sm:text-lg font-extrabold">
              Share this link with Mom, Dad &amp; Family on WhatsApp
            </h2>
            <p className="text-xs sm:text-sm text-teal-100">
              When anyone ticks a medicine or snaps a strip photo, it updates on everyone&apos;s phone immediately and resets fresh every morning at midnight.
            </p>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
            <button
              onClick={handleCopyShareLink}
              className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-extrabold px-4 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition"
            >
              <Share2 className="w-4 h-4" />
              Copy Link
            </button>
            <button
              onClick={() => setModalOpen('share')}
              className="bg-teal-950/80 hover:bg-teal-950 text-teal-100 border border-teal-600 font-bold px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center gap-1.5 transition"
            >
              <QrCode className="w-4 h-4 text-amber-300" />
              QR &amp; Phone Setup
            </button>
          </div>
        </div>

        {syncError && (
          <div className="bg-red-100 border-2 border-red-400 text-red-900 p-4 rounded-2xl flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
            <p className="font-bold text-sm">{syncError}</p>
          </div>
        )}

        {/* LOW STOCK BANNER */}
        {lowStockMeds.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="bg-amber-200 text-amber-900 p-2 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-amber-950 text-base">
                  Medicine Refill Alert ({lowStockMeds.length} Low)
                </h3>
                <p className="text-sm text-amber-900">
                  {lowStockMeds.map((m) => `${m.name} (${m.stock} left)`).join(' • ')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('meds')}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-sm shrink-0 self-start sm:self-center"
            >
              Refill Stock
            </button>
          </div>
        )}

        {/* TOP NAVIGATION TABS */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex items-center justify-center gap-2 py-3.5 px-3 rounded-2xl font-extrabold text-sm sm:text-base transition border-2 ${
              activeTab === 'today'
                ? 'bg-teal-900 text-white border-teal-900 shadow-md'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Today&apos;s 19 Steps</span>
          </button>

          <button
            onClick={() => setActiveTab('meds')}
            className={`flex items-center justify-center gap-2 py-3.5 px-3 rounded-2xl font-extrabold text-sm sm:text-base transition border-2 ${
              activeTab === 'meds'
                ? 'bg-teal-900 text-white border-teal-900 shadow-md'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Camera className="w-5 h-5 shrink-0" />
            <span>Photos &amp; Stock</span>
          </button>

          <button
            onClick={() => setActiveTab('appts')}
            className={`flex items-center justify-center gap-2 py-3.5 px-3 rounded-2xl font-extrabold text-sm sm:text-base transition border-2 ${
              activeTab === 'appts'
                ? 'bg-teal-900 text-white border-teal-900 shadow-md'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Calendar className="w-5 h-5 shrink-0" />
            <span>Doctor Visits</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: TODAY'S 19-STEP CHECKLIST                          */}
        {/* ========================================================= */}
        {activeTab === 'today' && (
          <div className="space-y-4">
            {/* DATE BAR & PROGRESS */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-stone-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <button
                    onClick={() => shiftDate(-1)}
                    className="p-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800"
                    title="Previous Day"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <div className="text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900">
                        {isTodaySelected ? 'Today' : 'History / Future'}
                      </span>
                      {!isTodaySelected && (
                        <button
                          onClick={() => setSelectedDate(getLocalDateString(new Date()))}
                          className="text-xs font-bold text-teal-700 underline"
                        >
                          Back to Today
                        </button>
                      )}
                    </div>
                    <h2 className="text-lg sm:text-2xl font-black text-stone-900 mt-0.5">
                      {formattedSelectedDate}
                    </h2>
                  </div>

                  <button
                    onClick={() => shiftDate(1)}
                    className="p-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800"
                    title="Next Day"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>

                {/* WhatsApp Status & Reset */}
                <div className="flex items-center gap-2 self-center sm:self-auto">
                  <button
                    onClick={handleSendWhatsAppReport}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Send to WhatsApp
                  </button>
                  <button
                    onClick={() => setModalOpen('confirm-reset')}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-3 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-1"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-sm font-extrabold mb-1.5">
                  <span className="text-stone-700">
                    Completed: {completedDailyCount} of {totalDailyCount} Daily Steps
                  </span>
                  <span className="text-teal-800 text-base">{progressPercentage}%</span>
                </div>
                <div className="w-full h-4 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-500 rounded-full"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* TIME OF DAY FILTER PILLS */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { id: 'ALL', label: `All Day (${scheduleSteps.length})` },
                  { id: 'Morning', label: 'Morning (8:00 – 10:15 AM)' },
                  { id: 'Afternoon', label: 'Afternoon (12:45 – 2:40 PM)' },
                  { id: 'Night', label: 'Night (7:45 – 10:00 PM)' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setTimeFilter(tab.id)}
                    className={`px-3.5 py-2 rounded-2xl font-bold text-xs sm:text-sm whitespace-nowrap transition ${
                      timeFilter === tab.id
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  setEditingStep(null);
                  setStepForm({
                    name: '',
                    dosage: '1 Tablet',
                    time: '08:00',
                    period: 'Morning',
                    category: 'Medication',
                    medKey: 'pantop-40',
                    instructions: '',
                    decrementBy: 1
                  });
                  setModalOpen('add-step');
                }}
                className="bg-teal-800 hover:bg-teal-900 text-white font-bold px-3.5 py-2 rounded-2xl text-xs sm:text-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Custom Step
              </button>
            </div>

            {/* 19-STEP TIMELINE CARDS */}
            {loading ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-stone-200">
                <p className="text-lg font-bold text-stone-600 animate-pulse">
                  Loading Grandma&apos;s 19-step daily schedule...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSchedule.map((step, idx) => {
                  const status = currentDayCompletionMap[step.id];
                  const isDone = Boolean(status?.done);
                  const isTargetTherapy = step.category === 'Target Therapy';
                  const isHalfTablet =
                    step.dosage?.toLowerCase().includes('half') || step.dosage?.includes('½');
                  const catalogEntry = step.medKey ? medCatalog[step.medKey] : null;
                  const customPhotoUrl = catalogEntry?.photoUrl || step.photoUrl || null;

                  return (
                    <div
                      key={step.id}
                      onClick={() => handleToggleDailyStep(step)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleDailyStep(step);
                        }
                      }}
                      className={`group rounded-3xl p-3.5 sm:p-5 transition-all cursor-pointer select-none border-2 shadow-xs ${
                        isDone
                          ? 'bg-emerald-50/95 border-emerald-500'
                          : isTargetTherapy
                          ? 'bg-purple-50/60 border-purple-400 hover:border-purple-600'
                          : 'bg-white hover:border-teal-600 border-stone-200'
                      }`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* LEFT: LARGE CHECKBOX TARGET */}
                        <div className="pt-1 shrink-0">
                          {isDone ? (
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                              <Check className="w-7 h-7 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border-2 border-stone-400 bg-stone-50 group-hover:border-teal-700 flex items-center justify-center text-stone-300">
                              <Circle className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        {/* MIDDLE: SCHEDULE TIME, NAME, DOSE, INSTRUCTIONS */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            {/* Step Time Badge */}
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-xs font-black ${
                                isDone
                                  ? 'bg-emerald-200 text-emerald-950'
                                  : isTargetTherapy
                                  ? 'bg-purple-900 text-amber-300'
                                  : 'bg-stone-900 text-amber-300'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5" />
                              {formatTime12h(step.time)}
                            </span>

                            {/* Dose Highlight Badge */}
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-xs font-extrabold ${
                                isHalfTablet
                                  ? 'bg-amber-200 text-amber-950 border border-amber-400'
                                  : isTargetTherapy
                                  ? 'bg-red-600 text-white'
                                  : 'bg-teal-100 text-teal-900'
                              }`}
                            >
                              {step.dosage}
                            </span>

                            {/* Remaining Stock Badge */}
                            {catalogEntry && (
                              <span className="text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-lg">
                                Stock: {catalogEntry.stock}
                              </span>
                            )}

                            {/* Edit Step Small Icon */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStep(step);
                                setStepForm({
                                  name: step.name || '',
                                  dosage: step.dosage || '',
                                  time: step.time || '08:00',
                                  period: step.period || 'Morning',
                                  category: step.category || 'Medication',
                                  medKey: step.medKey || '',
                                  instructions: step.instructions || '',
                                  decrementBy: step.decrementBy ?? 1
                                });
                                setModalOpen('add-step');
                              }}
                              className="ml-auto p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                              title="Edit time or instructions"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Step Title */}
                          <h3
                            className={`text-base sm:text-xl font-extrabold leading-snug ${
                              isDone ? 'line-through text-emerald-950/70' : 'text-stone-900'
                            }`}
                          >
                            {step.name}
                          </h3>

                          {/* Instructions */}
                          {step.instructions && (
                            <p
                              className={`mt-1.5 text-xs sm:text-sm font-medium p-2.5 rounded-xl ${
                                isDone
                                  ? 'bg-emerald-100/70 text-emerald-900'
                                  : isTargetTherapy
                                  ? 'bg-purple-100 text-purple-950 font-bold border border-purple-300'
                                  : 'bg-stone-100 text-stone-700'
                              }`}
                            >
                              {step.instructions}
                            </p>
                          )}

                          {/* Given By Timestamp Stamp */}
                          {isDone && (
                            <div className="mt-2 inline-flex items-center gap-1.5 bg-emerald-700 text-white px-3 py-1 rounded-xl text-xs font-bold shadow-xs">
                              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                              <span>
                                Given by <strong>{status.by}</strong> at {status.at}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* RIGHT SIDE: MEDICINE IMAGE THUMBNAIL + UPLOAD PHOTO SLOT */}
                        <MedicineVisualBadge
                          item={step}
                          customPhotoUrl={customPhotoUrl}
                          onClickPhoto={(clickedItem) => {
                            setSelectedPhotoItem(clickedItem);
                            setModalOpen('photo');
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MEDICINE PHOTOS & PILL STOCK INVENTORY             */}
        {/* ========================================================= */}
        {activeTab === 'meds' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-2">
              <h2 className="text-xl font-extrabold text-stone-900">
                Grandma&apos;s 10 Medicines — Reference Photos &amp; Stock
              </h2>
              <p className="text-sm text-stone-600">
                Tap <strong>&quot;Upload Our Strip Photo&quot;</strong> on any medicine below to take a picture of your actual strip or bottle. Once uploaded, it immediately updates across all 19 daily tasks on everyone&apos;s phone!
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {catalogList.map((med) => {
                const isLow = Number(med.stock) <= (med.lowThreshold || 5);
                return (
                  <div
                    key={med.medKey}
                    className={`bg-white rounded-3xl p-4 border-2 shadow-xs flex items-start gap-4 ${
                      isLow ? 'border-amber-400 bg-amber-50/30' : 'border-stone-200'
                    }`}
                  >
                    <MedicineVisualBadge
                      item={{
                        name: med.name,
                        medKey: med.medKey,
                        visualType: med.visualType,
                        category: 'Medication'
                      }}
                      customPhotoUrl={med.photoUrl}
                      onClickPhoto={() => {
                        setSelectedPhotoItem({
                          name: med.name,
                          medKey: med.medKey,
                          visualType: med.visualType,
                          dosage: med.subtitle
                        });
                        setModalOpen('photo');
                      }}
                    />

                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <h3 className="text-lg font-extrabold text-stone-900 leading-tight">
                          {med.name}
                        </h3>
                        <p className="text-xs font-bold text-teal-800">{med.subtitle}</p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2.5 py-1 rounded-xl text-xs font-black ${
                            isLow
                              ? 'bg-red-100 text-red-900 border border-red-300'
                              : 'bg-stone-100 text-stone-800'
                          }`}
                        >
                          Stock: {med.stock} {med.unit}
                        </span>

                        <button
                          onClick={() => handleRestockMed(med.medKey, -1)}
                          className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-extrabold px-2 py-1 rounded-xl text-xs border border-stone-300 flex items-center"
                          title="Decrease stock by 1"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRestockMed(med.medKey, 1)}
                          className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-extrabold px-2 py-1 rounded-xl text-xs border border-stone-300 flex items-center"
                          title="Increase stock by 1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRestockMed(med.medKey, 10)}
                          className="bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold px-2.5 py-1 rounded-xl text-xs border border-emerald-300"
                        >
                          +10 Strip
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedPhotoItem({
                            name: med.name,
                            medKey: med.medKey,
                            visualType: med.visualType,
                            dosage: med.subtitle
                          });
                          setModalOpen('photo');
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-300 font-bold text-xs flex items-center justify-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {med.photoUrl ? 'View / Replace Photo' : 'Upload Our Strip Photo'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: DOCTOR APPOINTMENTS                                */}
        {/* ========================================================= */}
        {activeTab === 'appts' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-stone-900">
                  Doctor Visits &amp; Therapy Schedule
                </h2>
                <p className="text-sm text-stone-600">
                  Keep track of upcoming oncology visits, blood tests, and doctor instructions.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingAppt(null);
                  setApptForm({
                    title: '',
                    doctor: '',
                    location: '',
                    date: selectedDate,
                    time: '11:00',
                    notes: ''
                  });
                  setModalOpen('add-appt');
                }}
                className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-5 py-3 rounded-2xl flex items-center justify-center gap-2 shrink-0"
              >
                <Plus className="w-5 h-5" />
                Add Visit
              </button>
            </div>

            <div className="space-y-3">
              {appointments.map((appt) => (
                <div
                  key={appt.id}
                  className={`rounded-3xl p-5 border-2 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    appt.completed
                      ? 'bg-stone-100 border-stone-300 opacity-75'
                      : 'bg-white border-indigo-200'
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-indigo-900 text-white font-extrabold px-3 py-1 rounded-xl text-xs">
                        {appt.date}
                      </span>
                      <span className="bg-amber-300 text-stone-950 font-extrabold px-3 py-1 rounded-xl text-xs">
                        {formatTime12h(appt.time)}
                      </span>
                    </div>
                    <h3
                      className={`text-xl font-extrabold ${
                        appt.completed ? 'line-through text-stone-500' : 'text-stone-900'
                      }`}
                    >
                      {appt.title}
                    </h3>
                    <p className="text-sm font-bold text-indigo-900">
                      {appt.doctor} {appt.location ? `• ${appt.location}` : ''}
                    </p>
                    {appt.notes && (
                      <p className="text-sm text-stone-700 bg-stone-100 p-3 rounded-xl">
                        {appt.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleToggleApptCompleted(appt)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-1.5 ${
                        appt.completed
                          ? 'bg-stone-200 text-stone-700'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {appt.completed ? 'Done' : 'Mark Done'}
                    </button>
                    <button
                      onClick={() => handleDeleteDoc('appointments', appt.id, appt.title)}
                      className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* MODAL: VIEW / UPLOAD MEDICINE REFERENCE PHOTO             */}
      {/* ========================================================= */}
      {modalOpen === 'photo' && selectedPhotoItem && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-stone-900">
                  {selectedPhotoItem.name}
                </h3>
                <p className="text-xs font-bold text-teal-700">
                  {selectedPhotoItem.dosage || 'Medicine Reference Image'}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(null)}
                className="p-2 rounded-full hover:bg-stone-100 text-stone-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* LARGE PHOTO PREVIEW */}
            <div className="bg-stone-100 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[220px] border-2 border-dashed border-stone-300">
              {activeModalPhotoUrl ? (
                <img
                  src={activeModalPhotoUrl}
                  alt={selectedPhotoItem.name}
                  className="max-h-72 w-auto rounded-xl object-contain shadow-md"
                />
              ) : (
                <div className="text-center space-y-2 py-6">
                  <Camera className="w-12 h-12 text-stone-400 mx-auto" />
                  <p className="text-sm font-bold text-stone-700">
                    No custom strip photo uploaded yet
                  </p>
                  <p className="text-xs text-stone-500 max-w-xs">
                    Take a clear photo of your grandmother&apos;s actual medicine strip or bottle so everyone in the family can verify it at a glance.
                  </p>
                </div>
              )}
            </div>

            {/* HIDDEN FILE INPUT (ACCEPTS PHONE CAMERA OR GALLERY) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-4 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                <Upload className="w-5 h-5" />
                {uploadingPhoto
                  ? 'Compressing & Syncing Photo...'
                  : activeModalPhotoUrl
                  ? 'Replace with Another Photo'
                  : 'Take Photo / Choose from Phone'}
              </button>

              {activeModalPhotoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveCustomPhoto}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs"
                >
                  Remove Custom Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT SCHEDULE STEP                           */}
      {/* ========================================================= */}
      {modalOpen === 'add-step' && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-xl font-extrabold text-stone-900">
                {editingStep ? 'Edit Daily Timetable Step' : 'Add New Daily Step'}
              </h3>
              <button
                onClick={() => setModalOpen(null)}
                className="p-2 rounded-full hover:bg-stone-100 text-stone-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveStep} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-1">
                  Medicine or Meal Name *
                </label>
                <input
                  type="text"
                  required
                  value={stepForm.name}
                  onChange={(e) => setStepForm({ ...stepForm, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-semibold text-base"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-stone-800 mb-1">
                    Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={stepForm.time}
                    onChange={(e) => setStepForm({ ...stepForm, time: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-semibold text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-stone-800 mb-1">
                    Dose *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Half (½) Tablet or 1 Tablet"
                    value={stepForm.dosage}
                    onChange={(e) => setStepForm({ ...stepForm, dosage: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-semibold text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-800 mb-1">
                  Instructions
                </label>
                <textarea
                  rows={2}
                  value={stepForm.instructions}
                  onChange={(e) => setStepForm({ ...stepForm, instructions: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-medium text-base"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {editingStep && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteDoc('scheduleSteps', editingStep.id, editingStep.name);
                      setModalOpen(null);
                    }}
                    className="px-4 py-2.5 rounded-xl font-bold text-red-700 bg-red-50 hover:bg-red-100 text-sm"
                  >
                    Delete Step
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setModalOpen(null)}
                    className="px-5 py-2.5 rounded-xl font-bold text-stone-700 bg-stone-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl font-bold text-white bg-teal-800 hover:bg-teal-900"
                  >
                    Save Step
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD DOCTOR APPOINTMENT                             */}
      {/* ========================================================= */}
      {modalOpen === 'add-appt' && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-xl font-extrabold text-stone-900">
                Schedule Doctor / Hospital Visit
              </h3>
              <button
                onClick={() => setModalOpen(null)}
                className="p-2 rounded-full hover:bg-stone-100 text-stone-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveAppointment} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-1">
                  Visit Purpose *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Oncology Follow-up"
                  value={apptForm.title}
                  onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-stone-800 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={apptForm.date}
                    onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-800 mb-1">Time *</label>
                  <input
                    type="time"
                    required
                    value={apptForm.time}
                    onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-stone-300 font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={apptForm.notes}
                  onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-stone-300"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(null)}
                  className="px-5 py-2.5 rounded-xl font-bold bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-700"
                >
                  Save Visit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SHARE HOSTED LINK WITH PARENTS & FAMILY            */}
      {/* ========================================================= */}
      {modalOpen === 'share' && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-xl font-extrabold text-stone-900 flex items-center gap-2">
                <Smartphone className="w-6 h-6 text-teal-700" />
                Share Link &amp; Phone Setup Guide
              </h3>
              <button
                onClick={() => setModalOpen(null)}
                className="p-2 rounded-full hover:bg-stone-100 text-stone-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* QR CODE FOR EASY SCANNING BY PARENTS' PHONES */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col items-center text-center space-y-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                  window.location.href
                )}`}
                alt="QR Code for Family Link"
                className="w-36 h-36 rounded-xl border border-stone-300 bg-white p-2 shadow-xs"
              />
              <p className="text-xs font-bold text-stone-600">
                Scan with Mama or Papa&apos;s phone camera to open immediately
              </p>
            </div>

            <div className="space-y-3 text-sm text-stone-700">
              <div className="bg-teal-50 border border-teal-200 p-3.5 rounded-2xl space-y-1.5">
                <p className="font-extrabold text-teal-950">How to put this on every family phone:</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-teal-900">
                  <li>
                    Tap <strong>Copy Website Link</strong> below (or use the <strong>Share</strong> button in the top-right corner of this workspace) and send it in your family WhatsApp group.
                  </li>
                  <li>
                    On Android (Chrome): Tap the <strong>3 dots (⋮)</strong> → <strong>&quot;Add to Home screen&quot;</strong>.
                    <br />
                    On iPhone (Safari): Tap <strong>Share</strong> → <strong>&quot;Add to Home Screen&quot;</strong>.
                  </li>
                  <li>
                    Now it opens with 1 tap like a native app on their phone, synced in real time!
                  </li>
                </ol>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleCopyShareLink}
                className="w-full py-3.5 px-4 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-md"
              >
                <Share2 className="w-5 h-5" />
                Copy Website Link
              </button>

              <button
                onClick={handleSendWhatsAppReport}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-sm"
              >
                <ClipboardList className="w-5 h-5" />
                Send Today&apos;s Checklist on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CONFIRM RESET DAY                                  */}
      {/* ========================================================= */}
      {modalOpen === 'confirm-reset' && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <h3 className="text-xl font-extrabold text-stone-900">
              Reset Checkmarks for {selectedDate}?
            </h3>
            <p className="text-sm text-stone-600">
              This will uncheck all 19 tasks for {selectedDate}. Note: The app automatically gives you a fresh blank checklist every morning at midnight while saving previous days!
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setModalOpen(null)}
                className="px-4 py-2.5 rounded-xl font-bold text-stone-700 bg-stone-100"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDay}
                className="px-5 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700"
              >
                Yes, Reset Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}