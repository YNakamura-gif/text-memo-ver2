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

// -- Input Fields --
const locationInput = document.getElementById('locationInput');
const deteriorationNameInput = document.getElementById('deteriorationNameInput');
const photoNumberInput = document.getElementById('photoNumberInput');
const nextIdDisplay = document.getElementById('nextIdDisplay');

// -- Prediction Lists --
const locationPredictionsList = document.getElementById('locationPredictions');
const deteriorationPredictionsList = document.getElementById('deteriorationPredictions');

// -- Edit Modal Elements --
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editIdDisplay = document.getElementById('editIdDisplay');
const editLocationInput = document.getElementById('editLocationInput');
const editLocationPredictionsList = document.getElementById('editLocationPredictions');
const editDeteriorationNameInput = document.getElementById('editDeteriorationNameInput');
const editDeteriorationPredictionsList = document.getElementById('editDeteriorationPredictions');
const editPhotoNumberInput = document.getElementById('editPhotoNumberInput');
const cancelEditBtn = document.getElementById('cancelEditBtn');

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

// --- Prediction Logic ---

// 場所の予測候補を生成 (前方一致: 読み)
function generateLocationPredictions(inputText) {
  const searchTerm = inputText.trim().toLowerCase();
  if (!searchTerm) return [];

  // 読みで前方一致検索
  return locationPredictions
    .filter(item => item.reading && item.reading.toLowerCase().startsWith(searchTerm))
    .map(item => item.value) // 値 (部屋名) の配列を返す
    .slice(0, 10); // 最大10件表示
}

// 劣化名の予測候補を生成 (部位読み2文字 + 劣化名読み2文字 で前方一致)
function generateDeteriorationPredictions(inputText) {
  const searchTerm = inputText.trim().toLowerCase();
  if (!searchTerm) return [];

  let results = [];

  // 検索ロジック:
  // 1. 部位(2文字) + 劣化(2文字) の組み合わせで検索 (例: 「がひひび」)
  if (searchTerm.length >= 4) {
      const partPrefix = searchTerm.substring(0, 2);
      const deteriorationPrefix = searchTerm.substring(2, 4);
      const matchingParts = partPredictions.filter(p => p.reading && p.reading.toLowerCase().startsWith(partPrefix));
      const matchingDeteriorations = deteriorationPredictions.filter(d => d.reading && d.reading.toLowerCase().startsWith(deteriorationPrefix));

      matchingParts.forEach(part => {
          matchingDeteriorations.forEach(det => {
              results.push(`${part.value} ${det.value}`);
          });
      });
  }

  // 2. 部位のみで検索 (入力が2文字以上の場合)
  if (searchTerm.length >= 2) {
    const matchingPartsOnly = partPredictions
        .filter(p => p.reading && p.reading.toLowerCase().startsWith(searchTerm))
        .map(p => p.value); // 部位名のみも候補に含める
    results = results.concat(matchingPartsOnly);
  }

  // 3. 劣化名のみで検索 (入力が2文字以上の場合)
  if (searchTerm.length >= 2) {
    const matchingDeteriorationsOnly = deteriorationPredictions
      .filter(d => d.reading && d.reading.toLowerCase().startsWith(searchTerm))
      .map(d => d.value); // 劣化名のみも候補に含める
    results = results.concat(matchingDeteriorationsOnly);
  }

  // 重複を除去して最大10件返す
  return [...new Set(results)].slice(0, 10); 
}

// 予測リストを表示/更新する関数
function showPredictions(inputElement, predictionListElement, predictions) {
  // リストをクリア
  predictionListElement.innerHTML = '';

  if (predictions.length > 0) {
    predictions.forEach(prediction => {
      const li = document.createElement('li');
      li.textContent = prediction;
      li.classList.add('prediction-item');
      // mousedown を使うことで、blur イベントより先に実行され選択が可能になる
      li.addEventListener('mousedown', () => {
        inputElement.value = prediction;
        predictionListElement.classList.add('hidden');
        predictionListElement.innerHTML = ''; // 選択後にリストをクリア
      });
      predictionListElement.appendChild(li);
    });
    predictionListElement.classList.remove('hidden');
  } else {
    predictionListElement.classList.add('hidden');
  }
}

// 予測リストを隠す関数 (setTimeout用)
function hidePredictions(predictionListElement) {
    predictionListElement.classList.add('hidden');
}

// --- Event Listeners for Predictions ---

function setupPredictionListeners(inputElement, predictionListElement, generatorFn) {
    inputElement.addEventListener('input', () => {
        const inputText = inputElement.value;
        const predictions = generatorFn(inputText);
        showPredictions(inputElement, predictionListElement, predictions);
    });

    // フォーカスが外れたら少し遅れてリストを隠す
    inputElement.addEventListener('blur', () => {
        setTimeout(() => hidePredictions(predictionListElement), 150); // 150ms 待つ
    });

    // フォーカス時に再表示 (入力があれば)
    inputElement.addEventListener('focus', () => {
        const inputText = inputElement.value;
        if(inputText.trim()) { // 何か入力があれば予測を再試行
          const predictions = generatorFn(inputText);
          showPredictions(inputElement, predictionListElement, predictions);
        }
    });
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

  // Setup prediction listeners after data is loaded
  setupPredictionListeners(locationInput, locationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(deteriorationNameInput, deteriorationPredictionsList, generateDeteriorationPredictions);
  setupPredictionListeners(editLocationInput, editLocationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(editDeteriorationNameInput, editDeteriorationPredictionsList, generateDeteriorationPredictions);

  // TODO: Load initial data from Firebase
  // TODO: Set up other event listeners (forms, buttons etc.)
  // Example for Edit Modal Cancel Button (if needed later)
  if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
          editModal.classList.add('hidden');
      });
  }
}); 