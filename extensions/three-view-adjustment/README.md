# 三面図を数値と方向ボタンで調整するUI（非公式）

このフォーク内でレビューする改善案です。Charakuru公式のリリースではありません。
対象は **v1.0.4** の「三面図を調整」だけです。公式の全方向連動計算と保存形式を使い、画像やモデルの形状には手を加えません。

## 操作の変更

| 操作 | 新しいUI | 反映される範囲 |
|---|---|---|
| 大きさ | 数値入力、−/＋、モデルと同じ大きさ | 全方向 |
| 足元の高さ | cm入力、↓/↑、モデルの足元に合わせる | 全方向 |
| 左右の位置 | cm入力、←/→、中央に戻す | 表示中の方向 |
| 画像の濃さ | 0〜100%入力、−/＋、25/50/100% | 表示中の方向 |

- 1回の移動は **0.1cm**、大きさ・濃さは **1%**。Shift＋ボタン／矢印キーで10倍ずつ調整できます。
- 入力はEnterまたはフォーカス移動で確定。入力途中のEscapeでその欄を元に戻します。
- 空欄、途中の「−」、範囲外の数値を0に変換しません。不正な欄が残る間は適用・方向切替を止め、入力を保持します。
- 「濃さ」は0%=非表示、100%=完全表示。「透明度」の増減の解釈を逆にする必要がありません。
- プレビューと操作欄を並べ、狭い画面では縦に配置します。「全体を見る」はプレビューのカメラだけを動かします。
- 日英韓の表示、キーボード操作、ラベル、フォーカス表示、ロック、画像読み込み中、画像なしに対応します。
- 「適用」「キャンセル」「画像を外す」、画像の読込、3方向の大きさ・足元・ロックの連動は公式処理を使用します。

対象外: 3Dパーツ自体の変形・位置設定、三面図の生成、モデル選択、AI/API設定、リグ、サーバー設定。

## 導入・確認・復元

Node.js 24.15以降と、公式Release ZIPを展開した **未改変のv1.0.4キット** が必要です。
ブラウザで未保存の変更がある場合は、先に保存するかキャンセルしてください。
以下はこのリポジトリのルートから実行します。`/path/to/kit`はキットの展開フォルダへ置き換えてください。Windowsのパスも引用符で指定できます。

```sh
node extensions/three-view-adjustment/install.mjs install --kit "/path/to/kit"
node extensions/three-view-adjustment/install.mjs check --kit "/path/to/kit"
```

既存のキットのタブを再読み込みし、「モデル編集 → 三面図を調整」で確認します。サーバーの再起動は不要です。

```sh
node extensions/three-view-adjustment/install.mjs restore --kit "/path/to/kit"
```

復元後もタブを再読み込みします。元ファイルはキットの `.charakuru-local/three-view-adjustment/` に保存します。復元では入口をバイト単位で戻し、追加モジュールは未使用のまま保持します。プロジェクトの保存先や `.charakit` は変更しません。

入口のSHA256と5か所の接続点を検査します。別バージョン・想定外の手動変更は、書き込み前に拒否します。公式更新後は新しいキットにこのパッチを無理に適用せず、互換性を確認してください。

## テスト

公式キットは公開Gitツリーに含まれないため、テストは展開済みのv1.0.4を明示指定します。本体や制作素材をこのフォークへコピーする必要はありません。

PowerShell:

```powershell
$env:CHARAKURU_DIR = 'C:\path\to\fresh-official-kit'
npm ci --ignore-scripts --prefix extensions/three-view-adjustment
npm test --prefix extensions/three-view-adjustment
```

macOS / Linux:

```sh
npm ci --ignore-scripts --prefix extensions/three-view-adjustment
CHARAKURU_DIR=/path/to/fresh-official-kit npm test --prefix extensions/three-view-adjustment
```

計算テストは公式の `guideMetrics` / `alignThreeViews` を読み込みます。別実装のコピーとの比較ではありません。
インストーラーのテストは一時フォルダで行い、実プロジェクトを使いません。入力イベントの回帰テストだけにjsdomを使用します。実アプリやインストーラーに追加依存はありません。
詳細な画面検証は [検証記録](validation.md) を参照してください。

## 構成と扱い

- `public/`: 追加UI・数値処理・翻訳・スタイル。
- `lib/patch.mjs`: 公式UIの接続点にだけ追加する検査付きパッチ。
- `install.mjs`: 導入・検査・復元。
- `test/`: 公式の計算・範囲制約との整合性、導入／更新／復元の回帰テスト。

この改善案は [LICENSE](../../LICENSE) に従って扱います。元のライセンス・著作権表示は保持します。独立したRelease ZIP、パッケージ、ホスト版アプリは配布しません。公式の [CONTRIBUTING](../../CONTRIBUTING.md) は上流へのPRを受け付けていないため、このPRは **flll/Charakuru内だけ** を対象にしています。

## English

Unofficial, reviewable local patch for the **Charakuru v1.0.4 three-view dialog**. Numeric inputs, directional steppers, visibility presets, explicit shared/per-view scope, keyboard editing and a responsive preview replace slider-only adjustment. Existing guide math, project format, image bytes and model geometry remain unchanged. Japanese, English and Korean labels are included.

Use the `install`, `check`, and `restore` commands above against an extracted official kit. The installer verifies the original entrypoint before writing, backs it up, and rejects unknown edits. Reload the existing browser tab after installation or restoration. `CHARAKURU_DIR` points tests to a fresh official kit; no project data is needed. This fork PR is not an upstream submission or an official release.
