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

// --- Global State ---
let currentProjectId = null; // 例: "現場A_2024-04-08"
let currentBuildingId = null; // 例: "A棟"
let buildings = {}; // { "A棟": true, "B棟": true }
let lastUsedBuilding = null; // 前回選択した建物を記憶

// --- Firebase Refs ---
function getProjectBaseRef(projectId) {
  return database.ref(`projects/${projectId}`);
}
function getProjectInfoRef(projectId) {
  return database.ref(`projects/${projectId}/info`);
}
function getBuildingsRef(projectId) {
  return database.ref(`projects/${projectId}/buildings`);
}
// 劣化情報Refは後ほど

// --- Utility Functions ---

// プロジェクトIDを生成 (現場名と調査日から)
function generateProjectId(siteName, surveyDate) {
    if (!siteName || !surveyDate) return null;
    // ファイルパスとして安全な形式に変換 (スペースや特殊文字をアンダースコアに)
    const safeSiteName = siteName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return `${safeSiteName}_${surveyDate}`;
}

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

// --- Basic Info Management ---
const surveyDateInput = document.getElementById('surveyDate');
const siteNameInput = document.getElementById('siteName');
const initialBuildingNameInput = document.getElementById('buildingName'); // 初期建物名

// 基本情報をFirebaseに保存
async function saveBasicInfo() {
    const siteName = siteNameInput.value.trim();
    const surveyDate = surveyDateInput.value;
    const initialBuildingName = initialBuildingNameInput.value.trim();

    if (!siteName || !surveyDate) {
        // console.log("Site name or survey date is missing. Cannot save basic info or determine Project ID.");
        return; // 現場名か日付がないとプロジェクトIDが決まらない
    }

    const newProjectId = generateProjectId(siteName, surveyDate);
    if (!newProjectId) return;

    currentProjectId = newProjectId;
    console.log("Current Project ID set to:", currentProjectId);

    const infoData = {
        surveyDate: surveyDate,
        siteName: siteName,
        initialBuildingName: initialBuildingName // 初期建物名も保存
    };

    try {
        await getProjectInfoRef(currentProjectId).set(infoData);
        console.log("Basic info saved for project:", currentProjectId);
        // プロジェクトIDが変わった可能性があるので、建物のリスナー等を再設定
        setupBuildingManagementListeners();
    } catch (error) {
        console.error("Error saving basic info:", error);
        alert("基本情報の保存に失敗しました。");
    }
}

// アプリ起動時やプロジェクトID変更時に基本情報を読み込む
async function loadBasicInfo(projectId) {
    if (!projectId) return;
    try {
        const snapshot = await getProjectInfoRef(projectId).once('value');
        const info = snapshot.val();
        if (info) {
            surveyDateInput.value = info.surveyDate || '';
            siteNameInput.value = info.siteName || '';
            initialBuildingNameInput.value = info.initialBuildingName || '';
            console.log("Basic info loaded for project:", projectId);
        } else {
            console.log("No basic info found for project:", projectId);
            // 必要ならフィールドをクリア
            // surveyDateInput.value = '';
            // siteNameInput.value = '';
            // initialBuildingNameInput.value = '';
        }
    } catch (error) {
        console.error("Error loading basic info:", error);
    }
}

// 基本情報フィールドの変更を監視して保存
function setupBasicInfoListeners() {
    surveyDateInput.addEventListener('change', saveBasicInfo);
    siteNameInput.addEventListener('change', saveBasicInfo); 
    initialBuildingNameInput.addEventListener('change', saveBasicInfo);
}

// --- Building Management ---
const newBuildingNameInput = document.getElementById('newBuildingName');
const addBuildingBtn = document.getElementById('addBuildingBtn');
const buildingSelect = document.getElementById('buildingSelect');
const activeBuildingNameSpan = document.getElementById('activeBuildingName');

// 建物選択プルダウンを更新
function updateBuildingSelector(newBuildings) {
    buildings = newBuildings || {}; // グローバルステート更新
    const buildingNames = Object.keys(buildings);
    
    buildingSelect.innerHTML = ''; // 一旦クリア

    if (buildingNames.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "建物がありません";
        buildingSelect.appendChild(option);
        activeBuildingNameSpan.textContent = "(未選択)";
        currentBuildingId = null;
    } else {
        buildingNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            buildingSelect.appendChild(option);
        });

        // 前回選択した建物があればそれを選択、なければ最初の建物を選択
        const buildingToSelect = lastUsedBuilding && buildings[lastUsedBuilding] ? lastUsedBuilding : buildingNames[0];
        buildingSelect.value = buildingToSelect;
        currentBuildingId = buildingToSelect;
        activeBuildingNameSpan.textContent = currentBuildingId;
        console.log("Building selector updated. Selected:", currentBuildingId);
    }
    // TODO: 選択された建物に応じて劣化情報表示を更新する処理呼び出し
}

// 建物追加処理
async function addBuilding() {
    if (!currentProjectId) {
        alert("先に現場名と調査日を入力してプロジェクトを確定してください。");
        return;
    }
    const newName = newBuildingNameInput.value.trim();
    if (!newName) {
        alert("建物名を入力してください。");
        return;
    }
    if (buildings[newName]) {
        alert(`建物「${newName}」は既に追加されています。`);
        return;
    }

    try {
        // Firebaseに新しい建物を追加 (キーを建物名、値をtrue)
        await getBuildingsRef(currentProjectId).child(newName).set(true);
        console.log(`Building "${newName}" added to project ${currentProjectId}`);
        newBuildingNameInput.value = ''; // 入力フィールドクリア
        // リスナーが変更を検知して updateBuildingSelector が呼ばれるはず
    } catch (error) {
        console.error("Error adding building:", error);
        alert("建物の追加に失敗しました。");
    }
}

// Firebaseの建物リストの変更を監視
let buildingsListener = null;
function setupBuildingManagementListeners() {
    if (!currentProjectId) {
        console.log("Project ID not set, cannot setup building listeners.");
        updateBuildingSelector(null); // プルダウンをリセット
        return;
    }

    // 既存のリスナーがあればデタッチ
    if (buildingsListener) {
        getBuildingsRef(currentProjectId).off('value', buildingsListener);
        console.log("Detached existing buildings listener for old project ID.");
    }

    console.log("Setting up buildings listener for project:", currentProjectId);
    const buildingsRef = getBuildingsRef(currentProjectId);
    buildingsListener = buildingsRef.on('value', (snapshot) => {
        const newBuildingsData = snapshot.val();
        console.log("Buildings data received from Firebase:", newBuildingsData);
        updateBuildingSelector(newBuildingsData); 
    }, (error) => {
        console.error("Error listening for building changes:", error);
        alert("建物リストの取得中にエラーが発生しました。");
    });

    // プルダウン変更時の処理
    buildingSelect.addEventListener('change', () => {
        currentBuildingId = buildingSelect.value;
        lastUsedBuilding = currentBuildingId; // 最後に選択した建物を記憶
        activeBuildingNameSpan.textContent = currentBuildingId || "(未選択)";
        console.log("Building selected:", currentBuildingId);
        // TODO: 選択された建物に応じて劣化情報表示を更新する処理呼び出し
    });

    // 建物追加ボタンのリスナー（一度だけ設定）
    // addBuildingBtn のリスナーは DOMContentLoaded で一度だけ設定する方が良いかもしれない
    // ここで毎回設定すると重複する可能性があるため注意
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  // Set current year in footer
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

  // Initialize with Info tab active
  switchTab('info');

  // Load prediction data (CSV)
  await loadPredictionData();
  console.log("Prediction data loaded.");

  // Setup prediction listeners
  setupPredictionListeners(locationInput, locationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(deteriorationNameInput, deteriorationPredictionsList, generateDeteriorationPredictions);
  setupPredictionListeners(editLocationInput, editLocationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(editDeteriorationNameInput, editDeteriorationPredictionsList, generateDeteriorationPredictions);

  // Setup basic info listeners
  setupBasicInfoListeners();

  // Initial attempt to load basic info based on current form values (if any)
  const initialSiteName = siteNameInput.value.trim();
  const initialSurveyDate = surveyDateInput.value;
  currentProjectId = generateProjectId(initialSiteName, initialSurveyDate);
  if (currentProjectId) {
    console.log("Initial Project ID derived from form:", currentProjectId);
    await loadBasicInfo(currentProjectId);
    // 初期のプロジェクトIDに基づいて建物のリスナーを開始
    setupBuildingManagementListeners(); 
  } else {
     console.log("Initial project ID could not be determined from form.");
     updateBuildingSelector(null); // 建物セレクタをリセット
  }

  // Setup building add button listener (once)
  addBuildingBtn.addEventListener('click', addBuilding);

  console.log("Initialization complete.");

  // TODO: Set up other event listeners (forms, buttons etc.)
  // ... (cancelEditBtn listener)
}); 