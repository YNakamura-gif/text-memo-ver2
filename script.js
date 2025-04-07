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

// Prediction Data Storage
let locationPredictions = []; // 部屋名
let partPredictions = [];     // 部位
let deteriorationPredictions = []; // 劣化名

// --- CSV Parsing and Loading --- 

// CSVテキストを解析して { value, reading } の配列を返す関数
function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/); // CR LF と LF 両方に対応
  if (lines.length <= 1) {
    console.warn("CSV file has no data or only a header.");
    return []; // ヘッダーのみ、または空の場合は空配列
  }
  const header = lines.shift(); // ヘッダー行を削除 (内容は使用しない)
  // console.log('CSV Header:', header); // デバッグ用

  return lines.map((line, index) => {
    const values = line.split(',');
    // 1列目を value, 2列目を reading とする
    const value = values[0]?.trim();
    const reading = values[1]?.trim();
    // value が存在する場合のみ有効なデータとする
    if (value) {
      return { value: value, reading: reading || '' }; // reading がなくても空文字で返す
    } else {
      // console.warn(`Skipping empty or invalid line ${index + 2} in CSV: ${line}`);
      return null; // 不正な行は null
    }
  }).filter(item => item !== null); // null を除去
}

// CSVファイルを指定されたエンコーディングで読み込み解析するヘルパー関数
async function fetchAndParseCsv(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for ${filePath}`);
    }
    const buffer = await response.arrayBuffer();
    
    // まず Shift_JIS で試す
    let decoder = new TextDecoder('shift_jis', { fatal: true }); // エラーがあれば例外をスロー
    let text = '';
    try {
      text = decoder.decode(buffer);
      console.log(`Successfully decoded ${filePath} with shift_jis.`);
    } catch (e) {
      console.warn(`Failed to decode ${filePath} with shift_jis, trying cp932... Error: ${e.message}`);
      // Shift_JIS で失敗した場合、CP932 (Windows-31J) を試す
      try {
          decoder = new TextDecoder('cp932', { fatal: true });
          text = decoder.decode(buffer);
          console.log(`Successfully decoded ${filePath} with cp932.`);
      } catch (e2) {
           console.error(`Failed to decode ${filePath} with both shift_jis and cp932. Error: ${e2.message}`);
           // デコード失敗。空のテキストを返すか、例外を再スローするか選択。
           throw new Error(`Failed to decode ${filePath}. Check file encoding.`); 
      }
    }

    // BOM (Byte Order Mark) が含まれている場合の除去 (念のため)
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    return parseCsv(text);

  } catch (error) {
    console.error(`Error fetching or parsing CSV ${filePath}:`, error);
    return []; // エラー時は空配列を返す
  }
}

// 3つの予測データCSVを読み込むメイン関数
async function loadPredictionData() {
  console.log("Loading prediction data...");
  try {
    // 並列でCSVファイルを読み込む
    [locationPredictions, partPredictions, deteriorationPredictions] = await Promise.all([
      fetchAndParseCsv('./部屋名_読み付き.csv'),            // 場所（部屋名）
      fetchAndParseCsv('./劣化項目_【部位】_読み付き.csv'),    // 劣化名（部位）
      fetchAndParseCsv('./劣化項目_【劣化名】_読み付き.csv') // 劣化名（劣化）
    ]);

    // デバッグ用に読み込んだ件数を表示
    console.log(`Loaded ${locationPredictions.length} location predictions (Rooms).`);
    console.log(`Loaded ${partPredictions.length} part predictions (Building Parts).`);
    console.log(`Loaded ${deteriorationPredictions.length} deterioration predictions (Defects).`);

    // TODO: Initialize prediction UI elements if needed

  } catch (error) {
    console.error("Critical error loading prediction data:", error);
    // エラーメッセージを表示するなど、ユーザーへの通知
    alert("予測変換データの読み込みに失敗しました。アプリケーションが正しく動作しない可能性があります。");
  }
}

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
document.addEventListener('DOMContentLoaded', async () => { // async に変更
  // Set current year in footer
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

  // Initialize with Info tab active
  switchTab('info'); 

  // Load prediction data (CSV)
  await loadPredictionData(); // await で読み込み完了を待つ

  console.log("Initialization complete. Prediction data loaded.");

  // TODO: Load initial data from Firebase
  // TODO: Set up other event listeners (forms, buttons etc.)
}); 