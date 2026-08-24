"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Ratio = "16:9" | "9:16" | "1:1";
type GpxStyle = "line" | "location" | "profile";
type LabelDensity = "none" | "major" | "detail";
type GenerationState = "idle" | "exporting" | "ready" | "error";
type PreviewMode = "clip" | "sequence";
type GpxPoint = { index: number; lat: number; lon: number; ele: number; time: number };
type GpxData = { name: string; points: GpxPoint[]; startTime: number; endTime: number };
type MediaItem = {
  id: string;
  name: string;
  detail: string;
  selected: boolean;
  kind: "video" | "image";
  url: string;
  file: File;
  capturedAt: number;
  durationSeconds: number | null;
  day: number | null;
  point: GpxPoint | null;
};

export default function Home() {
  const [duration, setDuration] = useState("60");
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const [gpxStyle, setGpxStyle] = useState<GpxStyle>("line");
  const [labels, setLabels] = useState<LabelDensity>("major");
  const [showMap, setShowMap] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [showAltitude, setShowAltitude] = useState(true);
  const [gpxName, setGpxName] = useState("");
  const [gpxData, setGpxData] = useState<GpxData | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("clip");
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const [sequenceProgress, setSequenceProgress] = useState(0);
  const [mediaOpen, setMediaOpen] = useState(true);
  const [generationState, setGenerationState] = useState<GenerationState>("idle");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationError, setGenerationError] = useState("");
  const [output, setOutput] = useState<{ url: string; name: string; size: number } | null>(null);
  const generationRun = useRef(0);
  const objectUrls = useRef<string[]>([]);
  const outputUrl = useRef("");
  const sequenceStart = useRef(0);

  const selectedMedia = useMemo(() => media.filter(item => item.selected), [media]);
  const previewMedia = selectedMedia.find(item => item.id === previewId) ?? selectedMedia[0];

  const generationBusy = generationState === "exporting";
  const targetSeconds = duration === "auto" ? Math.min(60, Math.max(12, selectedMedia.length * 4)) : Number(duration);
  const totalTime = formatClock(targetSeconds);

  useEffect(() => {
    if (!sequencePlaying || !selectedMedia.length) return;
    const clipSeconds = targetSeconds / selectedMedia.length;
    const timer = window.setInterval(() => {
      const elapsed = (window.performance.now() - sequenceStart.current) / 1000;
      if (elapsed >= targetSeconds) {
        setSequenceProgress(100);
        setSequencePlaying(false);
        return;
      }
      const index = Math.min(selectedMedia.length - 1, Math.floor(elapsed / clipSeconds));
      setPreviewId(selectedMedia[index].id);
      setSequenceProgress(elapsed / targetSeconds * 100);
    }, 100);
    return () => window.clearInterval(timer);
  }, [sequencePlaying, selectedMedia, targetSeconds]);

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
  }, []);

  async function readGpx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = parseGpx(await file.text());
    setGpxName(file.name);
    setGpxData(parsed);
    setMedia(items => matchAndSortMedia(items, parsed));
    resetGeneration();
    stopSequence();
  }

  function readVideos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    const next = files.map((file, index): MediaItem => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      detail: `${formatBytes(file.size)}・端末上で読み込み済み`,
      selected: true,
      kind: file.type.startsWith("image/") ? "image" as const : "video" as const,
      url: URL.createObjectURL(file),
      file,
      capturedAt: file.lastModified,
      durationSeconds: null,
      day: null,
      point: null,
    }));
    const matched = matchAndSortMedia(next, gpxData);
    objectUrls.current = matched.map(item => item.url);
    setMedia(matched);
    setPreviewId(matched[0].id);
    stopSequence();
    setMediaOpen(true);
    resetGeneration();
  }

  async function generate() {
    if (!gpxName || !selectedMedia.length || generationBusy) return;
    const run = ++generationRun.current;
    clearOutput();
    setGenerationError("");
    setGenerationProgress(0);
    setGenerationState("exporting");
    try {
      const result = await exportMovie({
        items: selectedMedia,
        seconds: targetSeconds,
        ratio,
        gpxStyle,
        labels,
        showMap,
        showLocation,
        showAltitude,
        gpxData,
        isCancelled: () => generationRun.current !== run,
        onProgress: value => { if (generationRun.current === run) setGenerationProgress(value); },
      });
      if (generationRun.current !== run) return;
      const url = URL.createObjectURL(result.blob);
      outputUrl.current = url;
      setOutput({ url, name: `yama-setlog.${result.extension}`, size: result.blob.size });
      setPreviewId(selectedMedia[0].id);
      setGenerationProgress(100);
      setGenerationState("ready");
    } catch (error) {
      if (generationRun.current !== run) return;
      setGenerationError(error instanceof Error ? error.message : "動画を書き出せませんでした。");
      setGenerationState("error");
    }
  }

  function toggleMedia(id: string) {
    setMedia(items => items.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
    resetGeneration();
    stopSequence();
  }

  function setAllMedia(selected: boolean) {
    setMedia(items => items.map(item => ({ ...item, selected })));
    resetGeneration();
    stopSequence();
  }

  function resetGeneration() {
    generationRun.current += 1;
    clearOutput();
    setGenerationProgress(0);
    setGenerationError("");
    setGenerationState("idle");
  }

  function clearOutput() {
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
    outputUrl.current = "";
    setOutput(null);
  }

  function movePreview(direction: -1 | 1) {
    if (selectedMedia.length < 2 || !previewMedia) return;
    const current = selectedMedia.findIndex(item => item.id === previewMedia.id);
    const next = (current + direction + selectedMedia.length) % selectedMedia.length;
    setPreviewId(selectedMedia[next].id);
  }

  function startSequence() {
    if (!selectedMedia.length) return;
    setPreviewMode("sequence");
    setPreviewId(selectedMedia[0].id);
    setSequenceProgress(0);
    sequenceStart.current = window.performance.now();
    setSequencePlaying(true);
  }

  function stopSequence() {
    setSequencePlaying(false);
    setSequenceProgress(0);
    setPreviewMode("clip");
  }

  function showClip(id: string) {
    stopSequence();
    setPreviewId(id);
  }

  function updateDuration(id: string, seconds: number) {
    if (!Number.isFinite(seconds)) return;
    setMedia(items => items.map(item => item.id === id ? { ...item, durationSeconds: seconds, detail: mediaDetail(item, seconds) } : item));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⌃</span>
          <strong>山せとろぐ（仮）</strong>
          <span className="project-name">{gpxData?.name || "山行記録"}</span>
        </div>
        <span className="save-state">下書き保存済み</span>
      </header>

      <div className="workspace">
        <aside className="editor-panel">
          <div className="intro-copy">
            <h1>山行ムービーを作る</h1>
            <p>GPXと撮影素材を追加すると、時刻と位置から自動で編集します。</p>
          </div>

          <section className="setting-section">
            <div className="section-heading"><h2>1. 素材</h2><span>自動照合</span></div>
            <label className="upload-row">
              <span className="upload-icon">⌁</span>
              <span className="upload-copy"><strong>{gpxName || "GPXを追加"}</strong><small>{gpxData ? `${gpxData.points.length}地点・${formatLocalDateTime(gpxData.startTime)}〜${formatLocalTime(gpxData.endTime)}` : ".gpxファイルを選択"}</small></span>
              {gpxName ? <span className="complete">✓</span> : <span className="choose-file">選択</span>}
              <input type="file" accept=".gpx,application/gpx+xml" onChange={readGpx} />
            </label>
            <label className="upload-row">
              <span className="upload-icon warm">▶</span>
              <span className="upload-copy"><strong>写真・動画を追加</strong><small>まとめて選択できます</small></span>
              <span className="file-count">{selectedMedia.length}/{media.length}本</span>
              <input type="file" accept="video/*,image/*" multiple onChange={readVideos} />
            </label>
            {media.length > 0 && <div className="media-selection">
              <div className="media-selection-head">
                <button type="button" className="media-disclosure" onClick={() => setMediaOpen(open => !open)} aria-expanded={mediaOpen}>
                  <span>使用する動画</span><strong>{selectedMedia.length}本を選択中</strong><i>{mediaOpen ? "−" : "+"}</i>
                </button>
                {mediaOpen && <div className="media-bulk-actions"><button type="button" onClick={() => setAllMedia(true)}>すべて選択</button><button type="button" onClick={() => setAllMedia(false)}>すべて解除</button></div>}
              </div>
              {mediaOpen && <div className="media-list">
                {media.map((item, index) => <div className={item.id === previewMedia?.id ? "media-item previewing" : "media-item"} key={item.id}>
                  <label className="media-check">
                    <input type="checkbox" checked={item.selected} onChange={() => toggleMedia(item.id)} aria-label={`${item.name}を動画に使用`} />
                    <span className="check-mark">✓</span>
                    <span className="media-order">{String(index + 1).padStart(2, "0")}</span>
                    <span className="media-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>
                  </label>
                  <button type="button" className="preview-target" disabled={!item.selected} onClick={() => showClip(item.id)}>{previewMode === "clip" && item.id === previewMedia?.id ? "表示中" : "確認"}</button>
                </div>)}
              </div>}
              {selectedMedia.length === 0 && <p className="media-warning">動画が選ばれていません。使用する動画にチェックを入れてください。</p>}
            </div>}
          </section>

          <section className="setting-section">
            <div className="section-heading"><h2>2. 完成動画の長さ</h2><span>{duration === "auto" ? "おまかせ" : `${duration}秒`}</span></div>
            <div className="choice-row four">
              {["30", "60", "90", "auto"].map((value) => <button type="button" key={value} className={duration === value ? "selected" : ""} onClick={() => { setDuration(value); stopSequence(); resetGeneration(); }}>{value === "auto" ? "おまかせ" : `${value}秒`}</button>)}
            </div>
          </section>

          <section className="setting-section">
            <div className="section-heading"><h2>3. フォーマット</h2><span>{ratio}</span></div>
            <div className="choice-row three">
              {(["9:16", "16:9", "1:1"] as Ratio[]).map((value) => <button type="button" key={value} className={ratio === value ? "selected" : ""} onClick={() => setRatio(value)}>{value === "9:16" ? "縦" : value === "16:9" ? "横" : "正方形"} {value}</button>)}
            </div>
          </section>

          <section className="setting-section">
            <div className="section-heading"><h2>4. GPXの見せ方</h2><span>実際の軌跡</span></div>
            <div className="visual-choices">
              {([{ id: "line", label: "白線ルート" }, { id: "location", label: "現在地ドン" }, { id: "profile", label: "標高断面" }] as { id: GpxStyle; label: string }[]).map(item => <button type="button" key={item.id} className={gpxStyle === item.id ? `visual-choice ${item.id} selected` : `visual-choice ${item.id}`} onClick={() => setGpxStyle(item.id)}><i />{item.label}</button>)}
            </div>
          </section>

          <section className="setting-section">
            <div className="section-heading"><h2>5. ルート上のラベル</h2><span>{labels === "none" ? "表示なし" : labels === "major" ? "開始・終了" : "時刻まで"}</span></div>
            <div className="choice-row three">
              {([{ id: "none", label: "なし" }, { id: "major", label: "開始・終了" }, { id: "detail", label: "DAY・時刻" }] as { id: LabelDensity; label: string }[]).map(item => <button type="button" key={item.id} className={labels === item.id ? "selected" : ""} onClick={() => setLabels(item.id)}>{item.label}</button>)}
            </div>
          </section>

          <section className="setting-section last">
            <div className="section-heading"><h2>6. 表示する情報</h2><span>プレビューに反映</span></div>
            <div className="switch-list">
              <Toggle label="ルート地図" note="現在地と歩いた軌跡" checked={showMap} onChange={setShowMap} />
              <Toggle label="地点・時刻" note="DAY・撮影時刻・座標" checked={showLocation} onChange={setShowLocation} />
              <Toggle label="標高" note="GPXから推定した標高" checked={showAltitude} onChange={setShowAltitude} />
            </div>
          </section>
        </aside>

        <section className="preview-panel">
          <div className="preview-heading"><strong>プレビュー</strong><span className={selectedMedia.length ? "selection-ok" : "selection-empty"}><i />{selectedMedia.length}本を動画に使用</span></div>
          <div className="preview-guide">
            <span><strong>まず、完成イメージを確認</strong><small>書き出す前に、選んだ素材を{targetSeconds}秒の順番でそのまま再生できます。</small></span>
            <button type="button" onClick={startSequence} disabled={!selectedMedia.length}>{sequencePlaying ? `再生中 ${Math.round(sequenceProgress)}%` : previewMode === "sequence" && sequenceProgress === 100 ? `▶ もう一度見る（${targetSeconds}秒）` : `▶ ${targetSeconds}秒の完成イメージを見る`}</button>
          </div>
          <div className="preview-context">
            <span>{previewMode === "sequence" ? "完成プレビュー" : "素材を確認中"}</span>
            <strong>{previewMedia?.name ?? "動画を選択してください"}</strong>
            {previewMedia && <small>{selectedMedia.findIndex(item => item.id === previewMedia.id) + 1} / {selectedMedia.length}</small>}
          </div>
          <div className="stage">
            <div className={`player ratio-${ratio.replace(":", "-")} style-${gpxStyle}`}>
              {previewMedia?.url ? previewMedia.kind === "video" ? <video className="uploaded-media" key={`${previewMode}-${previewMedia.url}`} src={previewMedia.url} controls={previewMode === "clip"} playsInline autoPlay muted loop={previewMode === "sequence"} onEnded={() => { if (previewMode === "clip") movePreview(1); }} onLoadedMetadata={event => updateDuration(previewMedia.id, event.currentTarget.duration)} /> : <img className="uploaded-media" src={previewMedia.url} alt={previewMedia.name} /> : <><div className="scene" aria-hidden="true"><span className="sun" /><span className="mountain far" /><span className="mountain near" /><span className="ridge" /></div><div className="sample-notice">まだ動画がありません。「写真・動画を追加」から実ファイルを選んでください。</div></>}
              <div className="movie-title">山せとろぐ（仮）{gpxData?.name ? `｜${gpxData.name}` : ""}</div>
              {gpxData && showMap && gpxStyle === "line" && <RouteOverlay gpx={gpxData} current={previewMedia?.point ?? null} labels={labels} />}
              {gpxData && previewMedia && showLocation && gpxStyle !== "profile" && <LocationStamp item={previewMedia} large={gpxStyle === "location"} />}
              {gpxData && previewMedia?.point && showAltitude && gpxStyle !== "profile" && <div className="altitude">{Math.round(previewMedia.point.ele).toLocaleString("ja-JP")} m</div>}
              {gpxData && gpxStyle === "profile" && <ElevationProfile gpx={gpxData} current={previewMedia?.point ?? null} />}
            </div>
          </div>
          <div className="playback">
            <div className={previewMode === "sequence" ? "timeline active" : "timeline"}><i style={{ width: previewMode === "sequence" ? `${sequenceProgress}%` : "0%" }} /></div>
            <div className="time-row"><span>{previewMode === "sequence" ? formatClock(targetSeconds * sequenceProgress / 100) : "00:00"}</span><span>{totalTime}</span></div>
            {generationState !== "idle" && <div className={`generation-status ${generationState}`} role="status" aria-live="polite">
              <div><span>{generationState === "exporting" ? "完成動画を書き出しています（このタブを閉じないでください）" : generationState === "ready" ? "完成動画ができました" : "書き出しに失敗しました"}</span><strong>{generationState === "error" ? "!" : `${generationProgress}%`}</strong></div>
              <div className="generation-progress"><i style={{ width: `${generationProgress}%` }} /></div>
              {generationState === "ready" && output && <p>{formatBytes(output.size)}・{targetSeconds}秒。下のボタンから端末へ保存できます。</p>}
              {generationState === "error" && <p>{generationError}</p>}
            </div>}
            <div className="export-explainer"><strong>端末に保存したいとき</strong><span>プレビュー確認後に押してください。{targetSeconds}秒版の書き出しには約{targetSeconds}秒かかります。</span></div>
            <div className="actions"><span>{!gpxName ? "GPXを選択してください" : selectedMedia.length ? `完成後、この場所にダウンロードボタンが出ます` : "動画を1本以上選択してください"}</span>{generationState === "ready" && output ? <a className="primary-action" href={output.url} download={output.name}>完成動画をダウンロード</a> : <button type="button" onClick={generate} disabled={!gpxName || !selectedMedia.length || generationBusy}>{generationBusy ? `書き出し中 ${generationProgress}%` : generationState === "error" ? "もう一度書き出す" : "この内容で完成動画を書き出す"}</button>}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}秒`;
}

function formatClock(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function parseGpx(xml: string): GpxData {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("GPXファイルを読み込めませんでした。");
  const pointNodes = Array.from(documentNode.getElementsByTagNameNS("*", "trkpt"));
  const points = pointNodes.map((node, index) => {
    const timeText = node.getElementsByTagNameNS("*", "time")[0]?.textContent ?? "";
    const eleText = node.getElementsByTagNameNS("*", "ele")[0]?.textContent ?? "0";
    return { index, lat: Number(node.getAttribute("lat")), lon: Number(node.getAttribute("lon")), ele: Number(eleText), time: Date.parse(timeText) };
  }).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon) && Number.isFinite(point.time));
  if (!points.length) throw new Error("時刻付きの軌跡がGPXに見つかりませんでした。");
  points.forEach((point, index) => { point.index = index; });
  const track = documentNode.getElementsByTagNameNS("*", "trk")[0];
  const name = track?.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || "山行記録";
  return { name, points, startTime: points[0].time, endTime: points[points.length - 1].time };
}

function matchAndSortMedia(items: MediaItem[], gpx: GpxData | null) {
  return items.map(item => {
    const point = gpx ? nearestPoint(gpx.points, item.capturedAt) : null;
    const matched = point && Math.abs(point.time - item.capturedAt) <= 15 * 60 * 1000 ? point : null;
    const duringTrip = gpx && item.capturedAt >= gpx.startTime && item.capturedAt <= gpx.endTime;
    const next = { ...item, point: matched, day: duringTrip && gpx ? dayFromStart(item.capturedAt, gpx.startTime) : null };
    return { ...next, detail: mediaDetail(next, item.durationSeconds) };
  }).sort((a, b) => a.capturedAt - b.capturedAt || a.name.localeCompare(b.name));
}

function nearestPoint(points: GpxPoint[], timestamp: number) {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].time < timestamp) low = middle + 1;
    else high = middle;
  }
  const after = points[low];
  const before = points[Math.max(0, low - 1)];
  return Math.abs(before.time - timestamp) <= Math.abs(after.time - timestamp) ? before : after;
}

function dayFromStart(timestamp: number, startTime: number) {
  const japanOffset = 9 * 60 * 60 * 1000;
  return Math.floor((timestamp + japanOffset) / 86_400_000) - Math.floor((startTime + japanOffset) / 86_400_000) + 1;
}

function formatLocalDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
}

function formatLocalTime(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
}

function formatCoordinates(point: GpxPoint) {
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

function mediaDetail(item: MediaItem, durationSeconds: number | null) {
  const duration = durationSeconds === null ? "" : `${formatDuration(durationSeconds)}・`;
  if (!item.day) return `${duration}${formatLocalDateTime(item.capturedAt)}・GPX期間外`;
  if (!item.point) return `${duration}DAY ${item.day}・${formatLocalTime(item.capturedAt)}・位置記録なし`;
  return `${duration}DAY ${item.day}・${formatLocalTime(item.capturedAt)}・${Math.round(item.point.ele).toLocaleString("ja-JP")} m`;
}

type ProjectedPoint = { x: number; y: number };

function projectRoute(points: GpxPoint[], width: number, height: number, padding: number) {
  const averageLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length * Math.PI / 180;
  const raw = points.map(point => ({ x: point.lon * Math.cos(averageLat), y: point.lat }));
  const minX = Math.min(...raw.map(point => point.x));
  const maxX = Math.max(...raw.map(point => point.x));
  const minY = Math.min(...raw.map(point => point.y));
  const maxY = Math.max(...raw.map(point => point.y));
  const scale = Math.min((width - padding * 2) / Math.max(.000001, maxX - minX), (height - padding * 2) / Math.max(.000001, maxY - minY));
  const drawnWidth = (maxX - minX) * scale;
  const drawnHeight = (maxY - minY) * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;
  const projected = raw.map(point => ({ x: offsetX + (point.x - minX) * scale, y: offsetY + (maxY - point.y) * scale }));
  return { points: projected, path: pathFromProjected(projected) };
}

function pathFromProjected(points: ProjectedPoint[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function elevationGeometry(points: GpxPoint[], maxPoints: number) {
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  const sampled = points.filter((_, index) => index % step === 0 || index === points.length - 1);
  const min = Math.min(...sampled.map(point => point.ele));
  const max = Math.max(...sampled.map(point => point.ele));
  return sampled.map((point, index) => ({ x: index / Math.max(1, sampled.length - 1), y: (point.ele - min) / Math.max(1, max - min) }));
}

type ExportOptions = {
  items: MediaItem[];
  seconds: number;
  ratio: Ratio;
  gpxStyle: GpxStyle;
  labels: LabelDensity;
  showMap: boolean;
  showLocation: boolean;
  showAltitude: boolean;
  gpxData: GpxData | null;
  isCancelled: () => boolean;
  onProgress: (value: number) => void;
};

async function exportMovie(options: ExportOptions) {
  if (typeof MediaRecorder === "undefined") throw new Error("このブラウザは端末内での動画書き出しに対応していません。ChromeまたはSafariの最新版でお試しください。");
  const dimensions = options.ratio === "9:16" ? [540, 960] : options.ratio === "1:1" ? [720, 720] : [960, 540];
  const canvas = document.createElement("canvas");
  canvas.width = dimensions[0];
  canvas.height = dimensions[1];
  const context = canvas.getContext("2d");
  if (!context || !("captureStream" in canvas)) throw new Error("このブラウザでは動画キャンバスを作成できません。");

  const canvasStream = canvas.captureStream(24);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioDestination = audioContext.createMediaStreamDestination();
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  const mimeType = pickRecordingType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("動画レコーダーでエラーが発生しました。"));
  });

  const clipSeconds = options.seconds / options.items.length;
  let renderedSeconds = 0;
  recorder.start(1000);
  try {
    for (const item of options.items) {
      if (options.isCancelled()) throw new Error("cancelled");
      if (item.kind === "image") {
        const image = await loadImage(item.url);
        await renderSegment(clipSeconds, time => {
          drawFrame(context, canvas, image, options, item);
          renderedSeconds += time;
          options.onProgress(Math.min(99, Math.round(renderedSeconds / options.seconds * 100)));
        }, options.isCancelled);
      } else {
        const video = document.createElement("video");
        video.src = item.url;
        video.playsInline = true;
        video.preload = "auto";
        video.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;bottom:-10px;opacity:.01;pointer-events:none";
        document.body.appendChild(video);
        try {
          await waitForMedia(video, "loadedmetadata");
          const source = audioContext.createMediaElementSource(video);
          source.connect(audioDestination);
          video.currentTime = 0;
          try {
            await video.play();
          } catch {
            video.muted = true;
            await video.play();
          }
          await renderSegment(clipSeconds, time => {
            if (video.ended || video.currentTime >= video.duration - 0.08) {
              video.currentTime = 0;
              void video.play().catch(() => undefined);
            }
            drawFrame(context, canvas, video, options, item);
            renderedSeconds += time;
            options.onProgress(Math.min(99, Math.round(renderedSeconds / options.seconds * 100)));
          }, options.isCancelled);
          video.pause();
          source.disconnect();
        } finally {
          video.removeAttribute("src");
          video.load();
          video.remove();
        }
      }
    }
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    await finished;
    stream.getTracks().forEach(track => track.stop());
    await audioContext.close();
  }
  if (options.isCancelled()) throw new Error("cancelled");
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mimeType }), extension };
}

function pickRecordingType() {
  const candidates = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

function waitForMedia(media: HTMLMediaElement, eventName: "loadedmetadata") {
  if (media.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("選択した動画を読み込めませんでした。")); };
    const cleanup = () => { media.removeEventListener(eventName, ready); media.removeEventListener("error", failed); };
    media.addEventListener(eventName, ready, { once: true });
    media.addEventListener("error", failed, { once: true });
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("選択した画像を読み込めませんでした。"));
    image.src = url;
  });
}

function renderSegment(seconds: number, draw: (elapsed: number) => void, isCancelled: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const started = performance.now();
    let previous = started;
    const frame = (now: number) => {
      if (isCancelled()) { reject(new Error("cancelled")); return; }
      const elapsed = (now - started) / 1000;
      draw((now - previous) / 1000);
      previous = now;
      if (elapsed >= seconds) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

function drawFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, source: CanvasImageSource, options: ExportOptions, item: MediaItem) {
  const width = canvas.width;
  const height = canvas.height;
  context.fillStyle = "#0b1210";
  context.fillRect(0, 0, width, height);
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : width;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);

  context.shadowColor = "rgba(0,0,0,.7)";
  context.shadowBlur = Math.max(5, width * .009);
  context.fillStyle = "white";
  context.font = `700 ${Math.round(width * .025)}px sans-serif`;
  context.fillText(`山せとろぐ（仮）${options.gpxData?.name ? `｜${options.gpxData.name}` : ""}`, width * .05, height * .09);
  context.shadowBlur = 0;

  if (options.gpxData && options.showMap && options.gpxStyle === "line") drawRoute(context, width, height, options.gpxData, item.point, options.labels);
  if (options.showLocation && options.gpxStyle !== "profile") {
    context.textAlign = "right";
    context.fillStyle = "rgba(255,255,255,.82)";
    context.font = `${Math.round(width * .014)}px sans-serif`;
    context.fillText(`${item.day ? `DAY ${item.day} ・ ` : ""}${formatLocalDateTime(item.capturedAt)}`, width * .95, height * .86);
    context.fillStyle = "white";
    context.font = `600 ${Math.round(width * .024)}px sans-serif`;
    context.fillText(item.point ? formatCoordinates(item.point) : item.day ? "位置記録なし" : "GPX期間外", width * .95, height * .92);
    context.textAlign = "left";
  }
  if (options.showAltitude && options.gpxStyle !== "profile" && item.point) {
    context.textAlign = "right";
    context.fillStyle = "white";
    context.font = `600 ${Math.round(width * .017)}px sans-serif`;
    context.fillText(`${Math.round(item.point.ele).toLocaleString("ja-JP")} m`, width * .95, height * .96);
    context.textAlign = "left";
  }
  if (options.gpxData && options.gpxStyle === "profile") drawProfile(context, width, height, options.gpxData, item.point);
}

function drawRoute(context: CanvasRenderingContext2D, width: number, height: number, gpx: GpxData, current: GpxPoint | null, labels: LabelDensity) {
  const geometry = projectRoute(gpx.points, 250, 300, 18);
  context.save();
  context.translate(width * .61, height * .04);
  context.scale(width * .00142, height * .00285);
  context.strokeStyle = "rgba(255,255,255,.5)";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(geometry.path));
  if (current) {
    context.strokeStyle = "white";
    context.lineWidth = 8;
    context.stroke(new Path2D(pathFromProjected(geometry.points.slice(0, current.index + 1))));
    const dot = geometry.points[current.index];
    if (dot) {
      context.fillStyle = "white";
      context.beginPath();
      context.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
  if (labels !== "none") {
    context.fillStyle = "white";
    context.font = `700 ${Math.round(width * .014)}px sans-serif`;
    context.fillText("START", width * .62, height * .91);
    context.fillText("GOAL", width * .93, height * .09);
    if (labels === "detail" && current) context.fillText(`DAY ${dayFromStart(current.time, gpx.startTime)}`, width * .75, height * .18);
  }
}

function drawProfile(context: CanvasRenderingContext2D, width: number, height: number, gpx: GpxData, current: GpxPoint | null) {
  context.save();
  context.fillStyle = "rgba(9,20,17,.55)";
  context.fillRect(width * .05, height * .72, width * .9, height * .21);
  context.strokeStyle = "white";
  context.lineWidth = Math.max(2, width * .003);
  context.beginPath();
  const profile = elevationGeometry(gpx.points, 100);
  profile.forEach((point, index) => {
    const x = width * (.07 + point.x * .86);
    const y = height * (.9 - point.y * .15);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  if (current) {
    const x = width * (.07 + current.index / Math.max(1, gpx.points.length - 1) * .86);
    context.strokeStyle = "rgba(255,255,255,.75)";
    context.beginPath();
    context.moveTo(x, height * .73);
    context.lineTo(x, height * .91);
    context.stroke();
  }
  context.restore();
}

function Toggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = `toggle-${label}`;
  return <label className="switch-row" htmlFor={id}><span><strong>{label}</strong><small>{note}</small></span><input id={id} aria-label={label} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><i /></label>;
}

function RouteOverlay({ gpx, current, labels }: { gpx: GpxData; current: GpxPoint | null; labels: LabelDensity }) {
  const geometry = projectRoute(gpx.points, 250, 300, 18);
  const currentPosition = current ? geometry.points[current.index] : null;
  const progress = current ? pathFromProjected(geometry.points.slice(0, current.index + 1)) : "";
  const start = geometry.points[0];
  const end = geometry.points[geometry.points.length - 1];
  return <div className="route-overlay"><svg viewBox="0 0 250 300" role="img" aria-label={`${gpx.name}のGPX軌跡`}><path className="route-full" d={geometry.path} />{progress && <path className="route-progress" d={progress} />}{currentPosition && <><circle className="current-halo" cx={currentPosition.x} cy={currentPosition.y} r="11" /><circle className="current-point" cx={currentPosition.x} cy={currentPosition.y} r="5" /></>}{labels !== "none" && <><g className="place-label"><circle cx={start.x} cy={start.y} r="2.3" /><text x={start.x + 7} y={start.y + 3}>START</text></g><g className="place-label"><circle cx={end.x} cy={end.y} r="2.3" /><text x={end.x + 7} y={end.y + 3}>GOAL</text></g>{labels === "detail" && currentPosition && <text className="current-label" x={currentPosition.x + 8} y={currentPosition.y - 8}>{`DAY ${dayFromStart(current!.time, gpx.startTime)}・${formatLocalTime(current!.time)}`}</text>}</>}</svg></div>;
}

function LocationStamp({ item, large }: { item: MediaItem; large: boolean }) {
  return <div className={large ? "location-stamp large" : "location-stamp"}><small>{item.day ? `DAY ${item.day} ・ ` : ""}{formatLocalDateTime(item.capturedAt)}</small><strong>{item.point ? formatCoordinates(item.point) : item.day ? "位置記録なし" : "GPX期間外"}</strong></div>;
}

function ElevationProfile({ gpx, current }: { gpx: GpxData; current: GpxPoint | null }) {
  const profile = elevationGeometry(gpx.points, 100);
  const line = profile.map((point, index) => `${index ? "L" : "M"}${(point.x * 500).toFixed(1)} ${(70 - point.y * 62).toFixed(1)}`).join(" ");
  const cursorX = current ? current.index / Math.max(1, gpx.points.length - 1) * 500 : 0;
  return <div className="elevation-profile"><div><span>標高断面</span><strong>{current ? `現在 ${Math.round(current.ele).toLocaleString("ja-JP")} m` : "撮影時刻を照合できません"}</strong></div><svg viewBox="0 0 500 75" preserveAspectRatio="none" role="img" aria-label={`${gpx.name}の標高断面`}><path d={`${line} L500 75 L0 75 Z`} />{current && <><line x1={cursorX} y1="2" x2={cursorX} y2="70" /><circle cx={cursorX} cy={Math.max(5, 70 - profile[Math.min(profile.length - 1, Math.round(current.index / Math.max(1, gpx.points.length - 1) * (profile.length - 1)))].y * 62)} r="4" /></>}</svg></div>;
}
