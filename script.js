// アプリケーションのメインロジックをここに記述します。
// 初期状態では空です。 

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBLP1YSrdUd_LGu4xZ-jKf-_FPYljq226w",
  authDomain: "project-4814457387099311122.firebaseapp.com",
  projectId: "project-4814457387099311122",
  storageBucket: "project-4814457387099311122.firebasestorage.app",
  messagingSenderId: "1065188683035",
  appId: "1:1065188683035:web:0a2dce8ad18521bfba77be",
  measurementId: "G-S3H1YJQEPR"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// DOM Elements
const infoTabBtn = document.getElementById('infoTabBtn');
const detailTabBtn = document.getElementById('detailTabBtn');
const infoTab = document.getElementById('infoTab');
const detailTab = document.getElementById('detailTab');
const currentYearSpan = document.getElementById('currentYear');

// --- Tab Switching Logic ---
function switchTab(activeTabId) {
  if (activeTabId === 'info') {
    infoTab.classList.remove('hidden');
    detailTab.classList.add('hidden');
    infoTabBtn.classList.add('bg-blue-600', 'text-white');
    infoTabBtn.classList.remove('bg-gray-200', 'text-gray-700');
    detailTabBtn.classList.add('bg-gray-200', 'text-gray-700');
    detailTabBtn.classList.remove('bg-blue-600', 'text-white');
  } else if (activeTabId === 'detail') {
    detailTab.classList.remove('hidden');
    infoTab.classList.add('hidden');
    detailTabBtn.classList.add('bg-blue-600', 'text-white');
    detailTabBtn.classList.remove('bg-gray-200', 'text-gray-700');
    infoTabBtn.classList.add('bg-gray-200', 'text-gray-700');
    infoTabBtn.classList.remove('bg-blue-600', 'text-white');
  }
}

// Event Listeners for Tabs
infoTabBtn.addEventListener('click', () => switchTab('info'));
detailTabBtn.addEventListener('click', () => switchTab('detail'));

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Set current year in footer
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

  // Initialize with Info tab active
  switchTab('info'); 

  // TODO: Load prediction data (CSV)
  // TODO: Load initial data from Firebase
  // TODO: Set up other event listeners
});

// --- Prediction Data Loading (Placeholder for CSV loading) ---
// let locationPredictions = [];
// let deteriorationPredictions = [];

// async function loadPredictionData() {
//   try {
//     const locationResponse = await fetch('./部屋名_読み付き.csv');
//     const locationCsv = await locationResponse.text();
//     locationPredictions = parseCsv(locationCsv); // Need parseCsv function

//     const deteriorationResponse = await fetch('./劣化項目_【劣化名】_読み付き.csv');
//     const deteriorationCsv = await deteriorationResponse.text();
//     deteriorationPredictions = parseCsv(deteriorationCsv); // Need parseCsv function

//     console.log("Prediction data loaded.");
//   } catch (error) {
//     console.error("Error loading prediction data:", error);
//   }
// }

// function parseCsv(csvText) {
//   // Basic CSV parsing - assumes no escaped commas or quotes within fields
//   const lines = csvText.trim().split('\n');
//   // Skip header if exists: const header = lines.shift().split(',');
//   return lines.map(line => {
//       const values = line.split(',');
//       // Adjust index based on your CSV structure (e.g., [0] = value, [1] = reading)
//       return { value: values[0]?.trim(), reading: values[1]?.trim() }; 
//   }).filter(item => item.value); // Filter out empty lines
// }

// Placeholder call - will be called properly in DOMContentLoaded later
// loadPredictionData(); 