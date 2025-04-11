# 12条点検アプリケーション システムパターン

## システムアーキテクチャ

- **フロントエンド:** シングルページアプリケーション (SPA) として実装。
    - HTML (`index.html`): 基本的な構造とUI要素を定義。
    - CSS (`style.css` + Tailwind CSS): UIのスタイリング。
    - JavaScript (`script.js`): アプリケーションロジック、UI操作、Firebaseとの連携。
- **バックエンド/データストア:** Firebase Realtime Database を使用。
    - プロジェクト情報 (`projects/{projectId}/info`)。
    - 建物情報 (`projects/{projectId}/buildings/{buildingId}`)。
    - 劣化情報 (`projects/{projectId}/deteriorations/{buildingId}/{recordId}`): 建物ごとにデータを保存。
    - 劣化番号カウンター (`projects/{projectId}/counters/{buildingId}`): 建物ごとの連番管理。
- **静的ファイルホスティング:** Firebase Hosting を利用してWebアプリをデプロイ。

## コンポーネント間の関係

- `script.js` が中心となり、HTML要素のイベントを監視し、UIを更新し、Firebaseとのデータの読み書きを行う。
- ユーザーがプロジェクトや建物を選択すると、対応するデータがFirebaseから読み込まれ、UI（ドロップダウン、テーブルなど）に反映される。
- 劣化情報が登録・編集・削除されると、Firebaseのデータが更新され、リアルタイムリスナーを通じてUIにも反映される（表示順は**登録番号降順**）。
- 入力フィールドでは、入力内容に応じて予測変換関数が呼び出され、結果が候補リストとして表示される。

## 採用している設計パターン

- **イベント駆動:** ユーザー操作（クリック、入力、選択変更など）に応じて処理が実行される。
- **Observer パターン:** Firebaseのリアルタイムリスナー (`on('value', ...)` ) により、データ変更を監視し、UIを自動更新。
- **モジュール化（部分的）:** `script.js` 内で機能ごとに関数を定義しているが、ファイル分割による本格的なモジュール化は未実施。

## 実装上の重要な経路

1.  **初期化 (`initializeApp`):** DOM読み込み完了後に実行。要素参照取得、予測データ読み込み、プロジェクトリスト読み込み、イベントリスナー設定、前回状態復元。
2.  **プロジェクト選択:** ドロップダウン変更 → `change` イベント → `updateBuildingSelectorForProject` → Firebaseから建物リスト取得・表示。
3.  **建物選択:** ドロップダウン変更 → `change` イベント → `handleBuildingSelectChange` → `fetchAndRenderDeteriorations` → Firebaseから劣化情報取得・表示（降順ソート）、リスナー設定。
4.  **劣化情報登録:** フォーム送信 → `submit` イベント → `handleDeteriorationSubmit` → `getNextDeteriorationNumber` (カウンター更新) → Firebaseへデータ書き込み。
5.  **予測表示:** 入力フィールド `input` イベント → `setupPredictionListeners` 内 → `generate...Predictions` → `showPredictions` → 候補リスト表示。 