# techContext.md

## 使用技術とライブラリ
- **フロントエンド:**
    - HTML5
    - CSS3
        - [Tailwind CSS](https://tailwindcss.com/): ユーティリティファーストのCSSフレームワーク (UIベースとして提供されたものを利用)
    - JavaScript (ES6+)
- **バックエンド (BaaS):**
    - [Firebase](https://firebase.google.com/)
        - Realtime Database: NoSQLデータベース、リアルタイム同期
        - Hosting: 静的Webホスティング
        - Firebase SDK (JavaScript): フロントエンドからのFirebase利用
- **開発ツール:**
    - Visual Studio Code (または任意のテキストエディタ)
    - Git: バージョン管理
    - Webブラウザ (開発者ツール)
- **その他:**
    - (なし)

## 開発環境の設定
- Node.js と npm (Firebase CLIのインストールに必要)
- Firebase CLI のインストール (`npm install -g firebase-tools`)
- Firebase プロジェクトの作成 (Webコンソール経由)
- ローカルでの Firebase ログイン (`firebase login`)
- プロジェクトディレクトリでの Firebase 初期化 (`firebase init`)
    - Hosting と Realtime Database を選択

## 技術的制約
- **オンライン必須:** Firebase Realtime Database を利用するため、基本的にオンライン環境での使用が前提となる（Firebaseの基本的なオフラインキャッシュは機能するが、完全なオフライン動作はMVPでは実装しない）。
- **Firebase 無料枠:** Realtime Database、Hosting ともに無料枠の制限（データ量、読み書き回数、転送量など）がある。大規模利用の場合は有料プランへの移行が必要になる可能性がある。
- **ブラウザ互換性:** モダンブラウザ (Chrome, Firefox, Safari, Edgeの最新版) を対象とする。

## ツールの使用パターン
- **Git:** 機能実装や修正ごとにコミット。ブランチ戦略はGitflowを基本とする (featureブランチで開発)。
- **Firebase CLI:** デプロイ (`firebase deploy`)、ローカルでのエミュレータ起動（開発中）などに使用。
- **Firebase Console:** Realtime Databaseのデータ確認、Hostingの設定、使用状況のモニタリングに使用。 