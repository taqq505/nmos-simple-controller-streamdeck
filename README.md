# NMOS Simple Controller

A Stream Deck plugin for NMOS IS-05 routing control.
Assign Receiver and Sender (TAKE) buttons to your Stream Deck to switch video/audio routes with a single press.

---

## Features

- **Receiver button** — Select a target receiver. Highlights on press; only one receiver is active at a time.
- **Sender (TAKE) button** — Execute IS-05 TAKE to connect a sender to the selected receiver.
- **ST 2110-7 support** — Automatically detects redundant (primary/secondary) streams from SDP and patches accordingly.
- **BCC integration** — Discover NMOS nodes and resources directly from a running Browser-based Controller (BCC).
- **Manual mode** — Configure IS-04 URL directly without BCC.
- **Selector / Static receiver modes** — TAKE button can target either the globally selected Receiver button or a fixed receiver.

## Requirements

- Stream Deck software 6.9 or later
- Windows 10 / macOS 12 or later
- An NMOS IS-04 / IS-05 compliant node on the network
- (Optional) A running BCC for node discovery

## Button Types

### Receiver

Press to mark this receiver as the global TAKE target. The button highlights in blue when selected.

**Property Inspector settings:**

| Field | Description |
|---|---|
| Source Mode | Manual (IS-04 URL) or From BCC |
| BCC Node | Select from nodes reported by BCC |
| Receiver | Select a receiver from the discovered list |

### Sender (TAKE)

Press to execute IS-05 TAKE — patches the sender's SDP to the target receiver.

**Property Inspector settings:**

| Field | Description |
|---|---|
| Sender Source | Manual or From BCC |
| Target Receiver | Selector Button (global) / Manual / From BCC |

**Button colors:**

| Color | Meaning |
|---|---|
| Amber (dashed border) | Target receiver is determined by selected Receiver button |
| Green (solid border) | Target receiver is fixed (BCC or manual) |

## BCC Integration

The plugin listens on `ws://localhost:57284` for a WebSocket connection from BCC.
In BCC, set the plugin WebSocket URL to `ws://localhost:57284` to enable node list sync.

## Development

```bash
npm install
npm run build
```

Requires Node.js 20+.

---

## 概要

NMOS IS-05 ルーティングを Stream Deck から操作するプラグインです。
Receiver ボタンと Sender (TAKE) ボタンを組み合わせて、ボタン一押しで映像・音声の切り替えが行えます。

## ボタンの使い方

### Receiver ボタン（青）

押すと、そのReceiverをTAKEのターゲットとして選択します。選択中は青くハイライトされます。
複数の Receiver ボタンを配置した場合、同時に選択できるのは1つだけです。

**設定項目：**

| 項目 | 説明 |
|---|---|
| Source Mode | Manual（IS-04 URLを直接入力）または From BCC |
| BCC Node | BCC から取得したノード一覧から選択 |
| Receiver | 検出されたReceiver一覧から選択 |

### Sender (TAKE) ボタン

押すと IS-05 TAKE を実行し、SenderのSDPをターゲットReceiverにパッチします。

**設定項目：**

| 項目 | 説明 |
|---|---|
| Sender Source | Manual または From BCC |
| Target Receiver | セレクターボタン（グローバル選択）/ Manual / From BCC |

**ボタンの色の意味：**

| 色 | 意味 |
|---|---|
| アンバー（破線ボーダー） | ターゲットReceiverはグローバルの選択中Receiverボタンを使用 |
| グリーン（実線ボーダー） | ターゲットReceiverが固定（BCCまたはManual指定） |

## BCC との連携

プラグインは `ws://localhost:57284` でWebSocket接続を待ち受けます。
BCC 側でプラグインのWebSocket URLを `ws://localhost:57284` に設定することで、ノード一覧が自動同期されます。

## ST 2110-7 対応

SenderのSDPに `a=mid:PRIMARY` / `a=mid:SECONDARY` が含まれる場合（冗長ストリーム）、Receiverの `transport_params` のポート数に合わせて自動的にパッチ内容を切り替えます。

| Sender | Receiver | 動作 |
|---|---|---|
| ST 2110-7 対応 | ST 2110-7 対応 | Primary + Secondary 両方を有効化 |
| ST 2110-7 対応 | 非対応（1ポート） | Primary のみ使用 |
| 非対応 | ST 2110-7 対応 | Primary 有効 / Secondary 無効化 |
| 非対応 | 非対応 | シングルストリームでパッチ |
