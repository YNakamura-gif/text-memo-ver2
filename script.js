// ======================================================================
// 1. Firebase Configuration & Initialization
// ======================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBLP1YSrdUd_LGu4xZ-jKf-_FPYljq226w",
  authDomain: "project-4814457387099311122.firebaseapp.com",
  databaseURL: "https://project-4814457387099311122-default-rtdb.firebaseio.com",
  projectId: "project-4814457387099311122",
  storageBucket: "project-4814457387099311122.firebasestorage.app",
  messagingSenderId: "1065188683035",
  appId: "1:1065188683035:web:0a2dce8ad18521bfba77be",
  measurementId: "G-S3H1YJQEPR"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ======================================================================
// 2. Global State & Prediction Data Storage
// ======================================================================
let locationPredictions = [];
let partPredictions = [];
let deteriorationPredictions = [];

let currentProjectId = null;
let currentBuildingId = null;
let buildings = {};
let lastUsedBuilding = null;
let deteriorationData = {};
let deteriorationListeners = {};
let currentEditRecordId = null;
let lastAddedLocation = '';
let lastAddedName = '';
let buildingsListener = null; // Firebase listener for buildings

// ======================================================================
// 3. Firebase Reference Getters
// ======================================================================
function getProjectBaseRef(projectId) {
  return database.ref(`projects/${projectId}`);
}
function getProjectInfoRef(projectId) {
  return database.ref(`projects/${projectId}/info`);
}
function getBuildingsRef(projectId) {
  return database.ref(`projects/${projectId}/buildings`);
}
function getDeteriorationsRef(projectId, buildingId) {
  return database.ref(`projects/${projectId}/deteriorations/${buildingId}`);
}
function getDeteriorationCounterRef(projectId, buildingId) {
  return database.ref(`projects/${projectId}/counters/${buildingId}`);
}

// ======================================================================
// 4. Utility Functions
// ======================================================================
function generateProjectId(siteName) {
    if (!siteName) return null;
    const safeSiteName = siteName.replace(/[.#$\[\]]/g, '_'); 
    return safeSiteName;
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

// ======================================================================
// 5. CSV Parsing and Loading Functions
// ======================================================================
function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    console.warn("CSV file has no data or only a header.");
    return []; 
  }
  lines.shift(); // Skip header
  return lines.map((line) => {
    const values = line.split(',');
    const value = values[0]?.trim();
    const reading = values[1]?.trim();
    if (value) {
      return { value: value, reading: reading || '' };
    } else {
      return null;
    }
  }).filter(item => item !== null);
}

async function fetchAndParseCsv(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for ${filePath}`);
    }
    const buffer = await response.arrayBuffer();
    let decoder = new TextDecoder('shift_jis', { fatal: true });
    let text = '';
    try {
      text = decoder.decode(buffer);
      console.log(`Successfully decoded ${filePath} with shift_jis.`);
    } catch (e) {
      console.warn(`Failed to decode ${filePath} with shift_jis, trying cp932... Error: ${e.message}`);
      try {
          decoder = new TextDecoder('cp932', { fatal: true });
          text = decoder.decode(buffer);
          console.log(`Successfully decoded ${filePath} with cp932.`);
      } catch (e2) {
           console.error(`Failed to decode ${filePath} with both shift_jis and cp932. Error: ${e2.message}`);
           throw new Error(`Failed to decode ${filePath}. Check file encoding.`); 
      }
    }
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    return parseCsv(text);
  } catch (error) {
    console.error(`Error fetching or parsing CSV ${filePath}:`, error);
    return [];
  }
}

async function loadPredictionData() {
  console.log("Loading prediction data...");
  try {
    [locationPredictions, partPredictions, deteriorationPredictions] = await Promise.all([
      fetchAndParseCsv('./部屋名_読み付き.csv'),
      fetchAndParseCsv('./劣化項目_【部位】_読み付き.csv'), 
      fetchAndParseCsv('./劣化項目_【劣化名】_読み付き.csv')
    ]);
    console.log(`Loaded ${locationPredictions.length} location predictions (Rooms).`);
    console.log(`Loaded ${partPredictions.length} part predictions (Building Parts).`);
    console.log(`Loaded ${deteriorationPredictions.length} deterioration predictions (Defects).`);
  } catch (error) {
    console.error("Critical error loading prediction data:", error);
    alert("予測変換データの読み込みに失敗しました。アプリケーションが正しく動作しない可能性があります。");
  }
}

// ======================================================================
// 6. Prediction Logic Functions
// ======================================================================
function generateLocationPredictions(inputText) {
  console.log(`[generateLocationPredictions] Input: "${inputText}"`);
  console.log("[generateLocationPredictions] locationPredictions sample:", locationPredictions.slice(0, 5)); 
  const searchTerm = inputText.trim().toLowerCase();
  if (!searchTerm) return [];
  const filtered = locationPredictions
    .filter(item => {
      const readingLower = item.reading?.toLowerCase(); 
      if (readingLower && searchTerm.length > 0) { 
        console.log(`[Debug] Comparing location: reading='${readingLower}', term='${searchTerm}', match=${readingLower.startsWith(searchTerm)}`);
      }
      return readingLower && readingLower.startsWith(searchTerm);
    });
  console.log(`[generateLocationPredictions] Filtered count: ${filtered.length}`); 
  return filtered.map(item => item.value).slice(0, 10);
}

function generateDeteriorationPredictions(inputText) {
  console.log(`[generateDeteriorationPredictions] Input: "${inputText}"`);
  const searchTerm = inputText.trim().toLowerCase();
  let results = [];
  if (searchTerm.length === 2) {
    const partPrefix = searchTerm.charAt(0);
    const deteriorationPrefix = searchTerm.charAt(1);
    console.log(`[generateDeteriorationPredictions] Searching part prefix: '${partPrefix}', det prefix: '${deteriorationPrefix}'`);
    const matchingParts = partPredictions.filter(p => p.reading && p.reading.toLowerCase().startsWith(partPrefix));
    const matchingDeteriorations = deteriorationPredictions.filter(d => d.reading && d.reading.toLowerCase().startsWith(deteriorationPrefix));
    console.log(`[generateDeteriorationPredictions] Found ${matchingParts.length} parts and ${matchingDeteriorations.length} deteriorations.`);
    matchingParts.forEach(part => {
      matchingDeteriorations.forEach(det => { results.push(`${part.value} ${det.value}`); });
    });
  } else if (searchTerm.length === 1) {
     const partPrefix = searchTerm.charAt(0);
     console.log(`[generateDeteriorationPredictions] Searching part prefix only: '${partPrefix}'`);
      const matchingPartsOnly = partPredictions.filter(p => p.reading && p.reading.toLowerCase().startsWith(partPrefix)).map(p => p.value); 
      console.log(`[generateDeteriorationPredictions] Found ${matchingPartsOnly.length} parts only.`);
      results = matchingPartsOnly;
  } else {
      console.log("[generateDeteriorationPredictions] Input length not 1 or 2, skipping combo search.");
  }
  console.log("[generateDeteriorationPredictions] partPredictions sample:", partPredictions.slice(0, 3)); 
  console.log("[generateDeteriorationPredictions] deteriorationPredictions sample:", deteriorationPredictions.slice(0, 3));
  const uniqueResults = [...new Set(results)];
  console.log(`[generateDeteriorationPredictions] Total unique results before slice: ${uniqueResults.length}`);
  return uniqueResults.slice(0, 10);
}

function showPredictions(inputElement, predictionListElement, predictions) {
  console.log(`[showPredictions] Received ${predictions.length} predictions for input: ${inputElement.id}`);
  predictionListElement.innerHTML = '';
  if (predictions.length > 0) {
    predictions.forEach(prediction => {
      const li = document.createElement('li');
      li.textContent = prediction;
      li.classList.add('prediction-item');
      li.addEventListener('mousedown', () => {
        inputElement.value = prediction;
        predictionListElement.classList.add('hidden');
        predictionListElement.innerHTML = ''; 
      });
      predictionListElement.appendChild(li);
    });
    console.log(`[showPredictions] Showing prediction list for: ${inputElement.id}`);
    predictionListElement.classList.remove('hidden');
  } else {
    predictionListElement.classList.add('hidden');
  }
}

function hidePredictions(predictionListElement) {
  predictionListElement.classList.add('hidden');
}

function setupPredictionListeners(inputElement, predictionListElement, generatorFn) {
  inputElement.addEventListener('input', () => {
    const inputText = inputElement.value;
    const predictions = generatorFn(inputText);
    showPredictions(inputElement, predictionListElement, predictions);
  });
  inputElement.addEventListener('blur', () => {
    setTimeout(() => hidePredictions(predictionListElement), 150);
  });
  inputElement.addEventListener('focus', () => {
    const inputText = inputElement.value;
    if(inputText.trim()) { 
      const predictions = generatorFn(inputText);
      showPredictions(inputElement, predictionListElement, predictions);
    }
  });
}

// ======================================================================
// 7. UI Update Functions (Tabs, Table Rendering, etc.)
// ======================================================================
function switchTab(activeTabId, infoTabBtn, detailTabBtn, infoTab, detailTab) {
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

async function updateNextIdDisplay(projectId, buildingId, nextIdDisplayElement) {
  if (!projectId || !buildingId) {
    nextIdDisplayElement.textContent = '1';
    return;
  }
  try {
    const snapshot = await getDeteriorationCounterRef(projectId, buildingId).once('value');
    const currentCounter = snapshot.val() || 0;
    nextIdDisplayElement.textContent = (currentCounter + 1).toString();
  } catch (error) {
    console.error("Error fetching counter for next ID display:", error);
    nextIdDisplayElement.textContent = '-'; 
  }
}

function renderDeteriorationTable(buildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  console.log(`[renderDeteriorationTable] Rendering table for buildingId: ${buildingId}`); 
  console.log(`[renderDeteriorationTable] Current global currentBuildingId: ${currentBuildingId}`); 
  deteriorationTableBodyElement.innerHTML = ''; 
  const dataForBuilding = deteriorationData[buildingId] || {};
  console.log(`[renderDeteriorationTable] Data used for rendering (deteriorationData[${buildingId}]):`, dataForBuilding); 
  const records = Object.entries(dataForBuilding).map(([id, data]) => ({ id, ...data })).sort((a, b) => a.number - b.number); 
  console.log(`[renderDeteriorationTable] Sorted records to render (count: ${records.length}):`, records.slice(0, 5)); 
  if (records.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="text-center text-gray-500 py-4">この建物のデータはまだありません</td>`;
    deteriorationTableBodyElement.appendChild(tr);
  } else {
    records.forEach(record => {
      const tr = document.createElement('tr');
      tr.dataset.recordId = record.id; 
      tr.innerHTML = `
        <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900">${record.number}</td>
        <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHtml(record.location)}</td>
        <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHtml(record.name)}</td>
        <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHtml(record.photoNumber)}</td>
        <td class="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
          <button class="text-indigo-600 hover:text-indigo-900 mr-2 edit-btn">編集</button>
          <button class="text-red-600 hover:text-red-900 delete-btn">削除</button>
        </td>
      `;
      tr.querySelector('.edit-btn').addEventListener('click', () => handleEditClick(buildingId, record.id, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput));
      tr.querySelector('.delete-btn').addEventListener('click', () => handleDeleteClick(buildingId, record.id, record.number));
      deteriorationTableBodyElement.appendChild(tr);
    });
    console.log(`[renderDeteriorationTable] Finished rendering ${records.length} rows.`); 
  }
}

// ======================================================================
// 8. Data Management Functions (Save, Load, Add, Listeners)
// ======================================================================

// --- Basic Info --- 
async function saveBasicInfo(surveyDateInput, siteNameInput, initialBuildingNameInput, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  const siteName = siteNameInput.value.trim();
  const surveyDate = surveyDateInput.value;
  const initialBuildingName = initialBuildingNameInput.value.trim();
  if (!siteName) return;
  const newProjectId = generateProjectId(siteName);
  if (!newProjectId) return;
  
  // Check if Project ID actually changed
  const projectIdChanged = newProjectId !== currentProjectId;
  currentProjectId = newProjectId;
  console.log("Current Project ID set to:", currentProjectId);
  
  const infoData = { surveyDate, siteName, initialBuildingName };
  try {
    await getProjectInfoRef(currentProjectId).set(infoData);
    console.log("Basic info saved for project:", currentProjectId);
    if (projectIdChanged) {
      console.log("Project ID changed, re-setting building listeners.");
      await setupBuildingManagementListeners(buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    }
  } catch (error) {
    console.error("Error saving basic info:", error);
    alert("基本情報の保存に失敗しました。");
  }
}

async function loadBasicInfo(projectId, surveyDateInput, siteNameInput, initialBuildingNameInput) {
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
    }
  } catch (error) {
    console.error("Error loading basic info:", error);
  }
}

function setupBasicInfoListeners(surveyDateInput, siteNameInput, initialBuildingNameInput, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  const saveHandler = () => saveBasicInfo(surveyDateInput, siteNameInput, initialBuildingNameInput, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  surveyDateInput.addEventListener('change', saveHandler);
  siteNameInput.addEventListener('change', saveHandler);
  initialBuildingNameInput.addEventListener('change', saveHandler);
  console.log("[setupBasicInfoListeners] Listeners attached.");
}

// --- Buildings --- 
async function addBuilding(newBuildingNameInput) {
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
    await getBuildingsRef(currentProjectId).child(newName).set(true);
    console.log(`Building "${newName}" added to project ${currentProjectId}`);
    newBuildingNameInput.value = ''; 
  } catch (error) {
    console.error("Error adding building:", error);
    alert("建物の追加に失敗しました。");
  }
}

function updateBuildingSelector(newBuildings, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  console.log("[updateBuildingSelector] Updating selector with:", newBuildings);
  buildings = newBuildings || {};
  const buildingNames = Object.keys(buildings);
  buildingSelectElement.innerHTML = '';
  console.log("[updateBuildingSelector] Detaching all deterioration listeners before update.");
  detachAllDeteriorationListeners(); // Uses global deteriorationListeners
  if (buildingNames.length === 0) {
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "建物がありません";
    buildingSelectElement.appendChild(option);
    activeBuildingNameSpanElement.textContent = "(未選択)";
    currentBuildingId = null;
    renderDeteriorationTable(null, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  } else {
    buildingNames.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      buildingSelectElement.appendChild(option);
      console.log(`[updateBuildingSelector] Setting up listener for building: ${name}`);
      setupDeteriorationListener(currentProjectId, name, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    });
    const buildingToSelect = lastUsedBuilding && buildings[lastUsedBuilding] ? lastUsedBuilding : buildingNames[0];
    buildingSelectElement.value = buildingToSelect;
    currentBuildingId = buildingToSelect;
    activeBuildingNameSpanElement.textContent = currentBuildingId;
    console.log("[updateBuildingSelector] Building selector updated. Selected:", currentBuildingId);
    console.log(`[updateBuildingSelector] Calling initial renderDeteriorationTable for selected building: ${currentBuildingId}`);
    renderDeteriorationTable(currentBuildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    updateNextIdDisplay(currentProjectId, currentBuildingId, nextIdDisplayElement);
  }
}

// Needs to be async if await is used inside
async function setupBuildingManagementListeners(buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  if (!currentProjectId) {
    console.log("Project ID not set, cannot setup building listeners.");
    updateBuildingSelector(null, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    return;
  }
  if (buildingsListener) {
    try {
      if (buildingsListener.off) buildingsListener.off('value');
      console.log("Detached existing buildings listener for old project ID.");
    } catch(e) { console.warn("Could not detach old buildings listener:", e) }
    buildingsListener = null;
  }
  console.log("Setting up buildings listener for project:", currentProjectId);
  const buildingsRef = getBuildingsRef(currentProjectId);
  buildingsListener = buildingsRef;
  buildingsRef.on('value', (snapshot) => {
    const newBuildingsData = snapshot.val();
    console.log("[Callback] Buildings data received from Firebase:", newBuildingsData);
    updateBuildingSelector(newBuildingsData, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  }, (error) => {
    console.error("Error listening for building changes:", error);
    alert("建物リストの取得中にエラーが発生しました。");
  });
  // Setup change listener here, passing elements
  const changeHandler = () => handleBuildingSelectChange(buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  buildingSelectElement.removeEventListener('change', changeHandler); // Ensure no duplicates
  buildingSelectElement.addEventListener('change', changeHandler);
  console.log("[setupBuildingManagementListeners] Building select change listener attached.");
}

function handleBuildingSelectChange(buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  const newlySelectedBuildingId = buildingSelectElement.value;
  console.log(`[handleBuildingSelectChange] Changed to: ${newlySelectedBuildingId}`);
  if (newlySelectedBuildingId === currentBuildingId) {
    console.log("[handleBuildingSelectChange] Same building selected or no change, skipping redundant operations.");
    return; 
  }
  currentBuildingId = newlySelectedBuildingId;
  lastUsedBuilding = currentBuildingId;
  activeBuildingNameSpanElement.textContent = currentBuildingId || "(未選択)";
  console.log(`[handleBuildingSelectChange] Current building set to: ${currentBuildingId}`);
  if (currentBuildingId) {
    console.log(`[handleBuildingSelectChange] Calling renderDeteriorationTable for: ${currentBuildingId}`);
    renderDeteriorationTable(currentBuildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    console.log(`[handleBuildingSelectChange] Calling updateNextIdDisplay for: ${currentBuildingId}`);
    updateNextIdDisplay(currentProjectId, currentBuildingId, nextIdDisplayElement);
  } else {
    console.log("[handleBuildingSelectChange] No building selected, clearing table.");
    renderDeteriorationTable(null, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    updateNextIdDisplay(null, null, nextIdDisplayElement);
  }
}

// --- Deteriorations --- 
async function getNextDeteriorationNumber(projectId, buildingId) {
  if (!projectId || !buildingId) return null;
  const counterRef = getDeteriorationCounterRef(projectId, buildingId);
  try {
    const result = await counterRef.transaction(currentValue => (currentValue || 0) + 1);
    if (result.committed) {
      console.log(`Next number for ${buildingId}:`, result.snapshot.val());
      return result.snapshot.val();
    } else { console.error('Transaction aborted for counter'); return null; }
  } catch (error) { console.error("Error getting next deterioration number:", error); return null; }
}

async function handleDeteriorationSubmit(event, locationInput, deteriorationNameInput, photoNumberInput, nextIdDisplayElement) {
  event.preventDefault();
  if (!currentProjectId || !currentBuildingId) {
    alert("プロジェクトまたは建物が選択されていません。"); return;
  }
  const location = locationInput.value.trim();
  const name = deteriorationNameInput.value.trim();
  const photoNumber = photoNumberInput.value.trim();
  if (!location || !name) { alert("場所と劣化名を入力してください。"); return; }
  const nextNumber = await getNextDeteriorationNumber(currentProjectId, currentBuildingId);
  if (nextNumber === null) { alert("劣化番号の取得に失敗しました。もう一度試してください。"); return; }
  const newData = { number: nextNumber, location, name, photoNumber: photoNumber || '' };
  try {
    const deteriorationRef = getDeteriorationsRef(currentProjectId, currentBuildingId);
    await deteriorationRef.push(newData);
    console.log(`Deterioration data added for ${currentBuildingId}:`, newData);
    recordLastAddedData(location, name); // Uses global lastAdded...
    locationInput.value = '';
    deteriorationNameInput.value = '';
    photoNumberInput.value = '';
    updateNextIdDisplay(currentProjectId, currentBuildingId, nextIdDisplayElement);
  } catch (error) {
    console.error("Error adding deterioration data:", error);
    alert("劣化情報の追加に失敗しました。");
  }
}

function setupDeteriorationListener(projectId, buildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  if (!projectId || !buildingId) return;
  console.log(`---> [setupDeteriorationListener] Attempting to attach listener for ${buildingId} in project ${projectId}`); 
  const ref = getDeteriorationsRef(projectId, buildingId);
  // Ensure old listener for this specific building is detached if re-attaching
  if (deteriorationListeners[buildingId] && typeof deteriorationListeners[buildingId].off === 'function') {
    deteriorationListeners[buildingId].off();
    console.log(`Detached existing deterioration listener for ${buildingId} (inside setup)`);
  }
  deteriorationListeners[buildingId] = ref;
  ref.on('value', (snapshot) => {
    const newData = snapshot.val() || {}; 
    console.log(`[Listener Callback] Data received for ${buildingId}:`, newData); 
    deteriorationData[buildingId] = newData;
    console.log(`[Listener Callback] Updated local deteriorationData[${buildingId}]:`, deteriorationData[buildingId]); 
    if (buildingId === currentBuildingId) {
      console.log(`[Listener Callback] Calling renderDeteriorationTable for current building: ${buildingId}`); 
      renderDeteriorationTable(buildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    } else {
      console.log(`[Listener Callback] Data received for non-current building ${buildingId}, current is ${currentBuildingId}. Skipping render.`); 
    }
  }, (error) => {
    console.error(`Error listening for deterioration data for ${buildingId}:`, error);
  });
  console.log(`---> [setupDeteriorationListener] Listener attached for ${buildingId}.`); 
  // updateNextIdDisplay(projectId, buildingId, ???); // Need nextIdDisplayElement here
}

function detachAllDeteriorationListeners() {
  console.log("[detachAllDeteriorationListeners] Detaching all..."); 
  Object.entries(deteriorationListeners).forEach(([buildingId, listenerRef]) => {
    if (listenerRef && typeof listenerRef.off === 'function') { 
      listenerRef.off();
      console.log(`Detached deterioration listener for ${buildingId}`);
    } else {
      console.warn(`Invalid listenerRef found for building ${buildingId} in deteriorationListeners.`);
    }
  });
  deteriorationListeners = {}; 
  deteriorationData = {}; 
  console.log("[detachAllDeteriorationListeners] Detach complete. deteriorationListeners reset."); 
}

// --- Edit/Delete --- 
function handleEditClick(buildingId, recordId, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  if (!deteriorationData[buildingId] || !deteriorationData[buildingId][recordId]) {
    console.error(`Record ${recordId} not found for building ${buildingId}`); return;
  }
  const record = deteriorationData[buildingId][recordId];
  console.log(`Editing record ${recordId} for building ${buildingId}:`, record);
  currentEditRecordId = recordId;
  editModalElement.classList.remove('hidden');
  editIdDisplay.textContent = record.number;
  editLocationInput.value = record.location;
  editDeteriorationNameInput.value = record.name;
  editPhotoNumberInput.value = record.photoNumber;
}

async function handleEditSubmit(event, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, editModalElement) {
  event.preventDefault();
  if (!currentProjectId || !currentBuildingId || !currentEditRecordId) {
    alert("編集対象の情報が正しくありません。"); return;
  }
  const updatedData = {
    number: parseInt(editIdDisplay.textContent, 10), 
    location: editLocationInput.value.trim(),
    name: editDeteriorationNameInput.value.trim(),
    photoNumber: editPhotoNumberInput.value.trim()
  };
  if (!updatedData.location || !updatedData.name) { alert("場所と劣化名は必須です。"); return; }
  try {
    const recordRef = getDeteriorationsRef(currentProjectId, currentBuildingId).child(currentEditRecordId);
    await recordRef.update(updatedData);
    console.log(`Record ${currentEditRecordId} updated successfully.`);
    editModalElement.classList.add('hidden'); 
    currentEditRecordId = null; 
  } catch (error) {
    console.error("Error updating record:", error);
    alert("情報の更新に失敗しました。");
  }
}

async function handleDeleteClick(buildingId, recordId, recordNumber) {
  if (!currentProjectId) return;
  if (confirm(`番号 ${recordNumber} の劣化情報「${deteriorationData[buildingId]?.[recordId]?.name || '' }」を削除しますか？`)) {
    try {
      const recordRef = getDeteriorationsRef(currentProjectId, buildingId).child(recordId);
      await recordRef.remove();
      console.log(`Record ${recordId} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting record:", error);
      alert("情報の削除に失敗しました。");
    }
  }
}

// --- Continuous Registration --- 
function recordLastAddedData(location, name) {
  lastAddedLocation = location;
  lastAddedName = name;
  console.log("Recorded last added data for continuous add:", { location, name });
}

async function handleContinuousAdd(photoNumberInput, nextIdDisplayElement) {
  if (!currentProjectId || !currentBuildingId) { alert("プロジェクトまたは建物が選択されていません。"); return; }
  if (!lastAddedLocation || !lastAddedName) { alert("連続登録する元データがありません。一度通常登録を行ってください。"); return; }
  const photoNumber = photoNumberInput.value.trim();
  const nextNumber = await getNextDeteriorationNumber(currentProjectId, currentBuildingId);
  if (nextNumber === null) { alert("劣化番号の取得に失敗しました。もう一度試してください。"); return; }
  const newData = { number: nextNumber, location: lastAddedLocation, name: lastAddedName, photoNumber: photoNumber || '' };
  try {
    const deteriorationRef = getDeteriorationsRef(currentProjectId, currentBuildingId);
    await deteriorationRef.push(newData);
    console.log(`Continuous deterioration data added for ${currentBuildingId}:`, newData);
    photoNumberInput.value = '';
    updateNextIdDisplay(currentProjectId, currentBuildingId, nextIdDisplayElement);
  } catch (error) {
    console.error("Error adding continuous deterioration data:", error);
    alert("連続登録に失敗しました。");
  }
}

// --- CSV Export --- 
function generateCsvContent(buildingId) {
  if (!currentProjectId || !buildingId || !deteriorationData[buildingId]) { alert("エクスポート対象のデータがありません。"); return null; }
  const dataToExport = Object.values(deteriorationData[buildingId]).sort((a, b) => a.number - b.number);
  if (dataToExport.length === 0) { alert(`建物「${buildingId}」にはエクスポートするデータがありません。`); return null; }
  const header = ["番号", "場所", "劣化名", "写真番号"];
  const rows = dataToExport.map(d => [d.number, `"${(d.location || '').replace(/"/g, '""')}"`, `"${(d.name || '').replace(/"/g, '""')}"`, `"${(d.photoNumber || '').replace(/"/g, '""')}"`].join(','));
  const csvContent = "\uFEFF" + header.join(',') + "\n" + rows.join("\n");
  return csvContent;
}

function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) { 
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); 
  } else { alert("お使いのブラウザはCSVダウンロードに対応していません。"); }
}

function handleExportCsv(buildingSelectElement, siteNameInputElement) {
  if (!currentProjectId) { alert("プロジェクトが特定できません。基本情報を入力してください。"); return; }
  const targetBuildingId = buildingSelectElement.value;
  if (!targetBuildingId) { alert("CSVをダウンロードする建物を選択してください。"); return; }
  const csvContent = generateCsvContent(targetBuildingId);
  if (csvContent) {
    const siteName = siteNameInputElement.value.trim() || 'プロジェクト';
    const safeSiteName = siteName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeBuildingName = targetBuildingId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${safeSiteName}_${safeBuildingName}_劣化情報.csv`;
    downloadCsv(csvContent, filename);
  }
}

// ======================================================================
// 9. Initialization (DOMContentLoaded)
// ======================================================================
document.addEventListener('DOMContentLoaded', async () => {
  
  // --- Get DOM Elements --- 
  const infoTabBtn = document.getElementById('infoTabBtn');
  const detailTabBtn = document.getElementById('detailTabBtn');
  const infoTab = document.getElementById('infoTab');
  const detailTab = document.getElementById('detailTab');
  const currentYearSpan = document.getElementById('currentYear');
  const surveyDateInput = document.getElementById('surveyDate');
  const siteNameInput = document.getElementById('siteName');
  const initialBuildingNameInput = document.getElementById('buildingName');
  const newBuildingNameInput = document.getElementById('newBuildingName');
  const addBuildingBtn = document.getElementById('addBuildingBtn');
  const buildingSelect = document.getElementById('buildingSelect');
  const activeBuildingNameSpan = document.getElementById('activeBuildingName');
  const locationInput = document.getElementById('locationInput');
  const deteriorationNameInput = document.getElementById('deteriorationNameInput');
  const photoNumberInput = document.getElementById('photoNumberInput');
  const nextIdDisplay = document.getElementById('nextIdDisplay');
  const locationPredictionsList = document.getElementById('locationPredictions');
  const deteriorationPredictionsList = document.getElementById('deteriorationPredictions');
  const deteriorationForm = document.getElementById('deteriorationForm');
  const deteriorationTableBody = document.getElementById('deteriorationTableBody');
  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  const editIdDisplay = document.getElementById('editIdDisplay');
  const editLocationInput = document.getElementById('editLocationInput');
  const editLocationPredictionsList = document.getElementById('editLocationPredictions');
  const editDeteriorationNameInput = document.getElementById('editDeteriorationNameInput');
  const editDeteriorationPredictionsList = document.getElementById('editDeteriorationPredictions');
  const editPhotoNumberInput = document.getElementById('editPhotoNumberInput');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const continuousAddBtn = document.getElementById('continuousAddBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  // --- Initial Setup --- 
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }
  switchTab('info', infoTabBtn, detailTabBtn, infoTab, detailTab);

  // --- Load Data --- 
  await loadPredictionData();
  console.log("Prediction data loaded.");

  // Try to determine initial project ID and load data
  const initialSiteName = siteNameInput.value.trim();
  currentProjectId = generateProjectId(initialSiteName);
  if (currentProjectId) {
    console.log("Initial Project ID derived from form:", currentProjectId);
    await loadBasicInfo(currentProjectId, surveyDateInput, siteNameInput, initialBuildingNameInput);
    await setupBuildingManagementListeners(buildingSelect, activeBuildingNameSpan, nextIdDisplay, deteriorationTableBody, editModal, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  } else {
    console.log("Initial project ID could not be determined from form.");
    updateBuildingSelector(null, buildingSelect, activeBuildingNameSpan, nextIdDisplay, deteriorationTableBody, editModal, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  }

  // --- Setup Event Listeners --- 
  // Tabs
  infoTabBtn.addEventListener('click', () => switchTab('info', infoTabBtn, detailTabBtn, infoTab, detailTab));
  detailTabBtn.addEventListener('click', () => switchTab('detail', infoTabBtn, detailTabBtn, infoTab, detailTab));
  
  // Predictions
  setupPredictionListeners(locationInput, locationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(deteriorationNameInput, deteriorationPredictionsList, generateDeteriorationPredictions);
  setupPredictionListeners(editLocationInput, editLocationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(editDeteriorationNameInput, editDeteriorationPredictionsList, generateDeteriorationPredictions);
  
  // Basic Info
  setupBasicInfoListeners(surveyDateInput, siteNameInput, initialBuildingNameInput, buildingSelect, activeBuildingNameSpan, nextIdDisplay, deteriorationTableBody, editModal, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
  
  // Building Add
  addBuildingBtn.addEventListener('click', () => addBuilding(newBuildingNameInput));

  // Deterioration Form Submit
  deteriorationForm.addEventListener('submit', (event) => handleDeteriorationSubmit(event, locationInput, deteriorationNameInput, photoNumberInput, nextIdDisplay));

  // Edit Form Submit
  editForm.addEventListener('submit', (event) => handleEditSubmit(event, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, editModal));

  // Continuous Add
  continuousAddBtn.addEventListener('click', () => handleContinuousAdd(photoNumberInput, nextIdDisplay));

  // CSV Export
  exportCsvBtn.addEventListener('click', () => handleExportCsv(buildingSelect, siteNameInput));

  // Edit Modal Cancel
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      editModal.classList.add('hidden');
    });
  }

  console.log("Initialization complete.");
}); 