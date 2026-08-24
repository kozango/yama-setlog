"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Ratio = "16:9" | "9:16" | "1:1";
type GpxStyle = "line" | "location" | "profile";
type LabelDensity = "none" | "major" | "detail";
type GenerationState = "idle" | "exporting" | "ready" | "error";
type PreviewMode = "clip" | "sequence";
type MediaItem = {
  id: string;
  name: string;
  detail: string;
  selected: boolean;
  kind: "video" | "image";
  url: string;
  file: File;
};

const fullRoute = "M20 270 L23 264 L25 260 L22 255 L22 249 L22 243 L25 238 L29 233 L30 227 L34 222 L37 217 L41 213 L43 209 L43 204 L45 198 L43 193 L45 188 L46 182 L47 177 L48 171 L48 165 L51 161 L55 157 L58 152 L57 147 L61 145 L65 143 L70 142 L75 139 L80 139 L83 135 L88 133 L90 130 L95 126 L99 124 L93 127 L93 123 L90 119 L87 114 L82 111 L78 108 L74 104 L70 101 L65 97 L61 94 L58 89 L59 84 L59 76 L63 73 L68 72 L73 72 L77 71 L81 66 L86 64 L90 68 L96 70 L101 68 L106 69 L112 70 L117 68 L122 65 L127 61 L132 58 L135 54 L135 48 L136 42 L138 36 L138 30 L140 26 L144 24 L150 21 L156 20 L159 18 L165 16 L171 16 L176 18 L182 21 L188 21 L193 24 L198 27 L202 32 L204 38 L205 43 L210 47 L213 53 L217 56 L219 62 L219 68 L221 74 L227 75 L230 77 L227 80 L222 83 L219 88 L217 94 L213 98 L208 102 L207 108 L206 114 L205 120 L206 126 L209 131 L210 137 L211 143 L211 149 L208 153 L205 158 L201 162 L202 168 L200 174 L199 180 L198 186 L200 191 L198 193 L195 199 L191 202 L186 206 L182 211 L178 216 L176 221 L175 227 L174 233 L170 238 L167 243 L162 246 L158 250 L153 248 L147 249 L142 252 L136 255 L131 255 L125 256 L122 251 L120 246 L116 245 L110 248 L105 246 L99 246 L94 248 L88 247 L82 245 L78 241 L72 239 L66 238 L60 236 L55 235 L50 231 L45 232 L39 235 L33 235 L27 235 L24 240 L22 245 L22 251 L23 257 L24 260";
const progressRoute = "M20 270 L23 264 L25 260 L22 255 L22 249 L22 243 L25 238 L29 233 L30 227 L34 222 L37 217 L41 213 L43 209 L43 204 L45 198 L43 193 L45 188 L46 182 L47 177 L48 171 L48 165 L51 161 L55 157 L58 152 L57 147 L61 145 L65 143 L70 142 L75 139 L80 139 L83 135 L88 133 L90 130 L95 126 L99 124 L93 127 L93 123 L90 119 L87 114 L82 111 L78 108 L74 104 L70 101 L65 97 L61 94 L58 89 L59 84 L59 76 L59 83";

const placeLabels = [
  { name: "上高地", x: 20, y: 270, type: "major" },
  { name: "前穂高岳", x: 89, y: 124, type: "major" },
  { name: "奥穂高岳", x: 59, y: 93, type: "major" },
  { name: "涸沢", x: 118, y: 66, type: "major" },
  { name: "岳沢小屋", x: 61, y: 149, type: "detail" },
  { name: "横尾", x: 163, y: 22, type: "detail" },
  { name: "明神", x: 130, y: 210, type: "detail" },
] as const;

export default function Home() {
  const [duration, setDuration] = useState("60");
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const [gpxStyle, setGpxStyle] = useState<GpxStyle>("line");
  const [labels, setLabels] = useState<LabelDensity>("major");
  const [showMap, setShowMap] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [showAltitude, setShowAltitude] = useState(true);
  const [gpxName, setGpxName] = useState("");
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

  function readGpx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setGpxName(file.name);
  }

  function readVideos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    const next = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      detail: `${formatBytes(file.size)}・端末上で読み込み済み`,
      selected: true,
      kind: file.type.startsWith("image/") ? "image" as const : "video" as const,
      url: URL.createObjectURL(file),
      file,
    }));
    objectUrls.current = next.map(item => item.url);
    setMedia(next);
    setPreviewId(next[0].id);
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
    setMedia(items => items.map(item => item.id === id && item.url ? { ...item, detail: `${formatDuration(seconds)}・端末上で再生可能` } : item));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⌃</span>
          <strong>山せとろぐ（仮）</strong>
          <span className="project-name">前穂・奥穂 テント泊</span>
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
              <span className="upload-copy"><strong>{gpxName || "GPXを追加"}</strong><small>{gpxName ? "端末上で読み込み済み" : ".gpxファイルを選択"}</small></span>
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
            <div className="section-heading"><h2>5. 地名ラベル</h2><span>{labels === "none" ? "表示なし" : labels === "major" ? "主要地点" : "詳細"}</span></div>
            <div className="choice-row three">
              {([{ id: "none", label: "なし" }, { id: "major", label: "主要地点" }, { id: "detail", label: "詳細" }] as { id: LabelDensity; label: string }[]).map(item => <button type="button" key={item.id} className={labels === item.id ? "selected" : ""} onClick={() => setLabels(item.id)}>{item.label}</button>)}
            </div>
          </section>

          <section className="setting-section last">
            <div className="section-heading"><h2>6. 表示する情報</h2><span>プレビューに反映</span></div>
            <div className="switch-list">
              <Toggle label="ルート地図" note="現在地と歩いた軌跡" checked={showMap} onChange={setShowMap} />
              <Toggle label="地点・時刻" note="撮影地点の名前と時刻" checked={showLocation} onChange={setShowLocation} />
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
              <div className="movie-title">山せとろぐ（仮）｜前穂・奥穂</div>
              {gpxName && showMap && gpxStyle === "line" && <RouteOverlay labels={labels} />}
              {gpxName && showLocation && gpxStyle !== "profile" && <div className={gpxStyle === "location" ? "location-stamp large" : "location-stamp"}><small>現在地｜DAY 2・06:17</small><strong>穂高岳山荘</strong></div>}
              {gpxName && showAltitude && gpxStyle !== "profile" && <div className="altitude">3,110 m</div>}
              {gpxName && gpxStyle === "profile" && <ElevationProfile />}
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

type ExportOptions = {
  items: MediaItem[];
  seconds: number;
  ratio: Ratio;
  gpxStyle: GpxStyle;
  labels: LabelDensity;
  showMap: boolean;
  showLocation: boolean;
  showAltitude: boolean;
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
          drawFrame(context, canvas, image, options);
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
            drawFrame(context, canvas, video, options);
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

function drawFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, source: CanvasImageSource, options: ExportOptions) {
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
  context.fillText("山せとろぐ（仮）", width * .05, height * .09);
  context.shadowBlur = 0;

  if (options.showMap && options.gpxStyle === "line") drawRoute(context, width, height, options.labels);
  if (options.showLocation && options.gpxStyle !== "profile") {
    context.textAlign = "right";
    context.fillStyle = "rgba(255,255,255,.82)";
    context.font = `${Math.round(width * .014)}px sans-serif`;
    context.fillText("現在地｜GPX照合", width * .95, height * .86);
    context.fillStyle = "white";
    context.font = `500 ${Math.round(width * .037)}px serif`;
    context.fillText("穂高岳山荘", width * .95, height * .92);
    context.textAlign = "left";
  }
  if (options.showAltitude && options.gpxStyle !== "profile") {
    context.textAlign = "right";
    context.fillStyle = "white";
    context.font = `600 ${Math.round(width * .017)}px sans-serif`;
    context.fillText("3,110 m", width * .95, height * .96);
    context.textAlign = "left";
  }
  if (options.gpxStyle === "profile") drawProfile(context, width, height);
}

function drawRoute(context: CanvasRenderingContext2D, width: number, height: number, labels: LabelDensity) {
  const path = new Path2D(fullRoute);
  context.save();
  context.translate(width * .61, height * .04);
  context.scale(width * .00142, height * .00285);
  context.strokeStyle = "rgba(255,255,255,.5)";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(path);
  context.restore();
  if (labels !== "none") {
    context.fillStyle = "white";
    context.font = `700 ${Math.round(width * .014)}px sans-serif`;
    context.fillText("上高地", width * .64, height * .83);
    context.fillText("穂高岳山荘", width * .72, height * .32);
    if (labels === "detail") context.fillText("涸沢", width * .84, height * .19);
  }
}

function drawProfile(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.fillStyle = "rgba(9,20,17,.55)";
  context.fillRect(width * .05, height * .72, width * .9, height * .21);
  context.strokeStyle = "white";
  context.lineWidth = Math.max(2, width * .003);
  context.beginPath();
  for (let index = 0; index <= 20; index++) {
    const x = width * (.07 + index * .043);
    const y = height * (.88 - Math.sin(index / 4) * .09 - index * .002);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function Toggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = `toggle-${label}`;
  return <label className="switch-row" htmlFor={id}><span><strong>{label}</strong><small>{note}</small></span><input id={id} aria-label={label} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><i /></label>;
}

function RouteOverlay({ labels }: { labels: LabelDensity }) {
  return <div className="route-overlay"><span className="north-note">北が上・実際のGPX形状</span><svg viewBox="0 0 250 300" role="img" aria-label="前穂・奥穂のGPX軌跡"><path className="route-full" d={fullRoute} /><path className="route-progress" d={progressRoute} /><circle className="current-halo" cx="59" cy="83" r="13" /><circle className="current-point" cx="59" cy="83" r="6" /><text className="current-label" x="69" y="82">穂高岳山荘</text>{labels !== "none" && placeLabels.filter(place => labels === "detail" || place.type === "major").map(place => <g className="place-label" key={place.name}><circle cx={place.x} cy={place.y} r="2.3" /><text x={place.x + 8} y={place.y + 3}>{place.name}</text></g>)}<text className="north" x="230" y="18">N ↑</text></svg></div>;
}

function ElevationProfile() {
  return <div className="elevation-profile"><div><span>標高断面</span><strong>現在 3,110 m</strong></div><svg viewBox="0 0 500 75" preserveAspectRatio="none" role="img" aria-label="山行の標高断面"><path d="M0 70 L20 64 L38 59 L55 51 L72 49 L88 41 L106 37 L124 31 L142 22 L159 26 L177 16 L194 9 L211 14 L229 6 L246 12 L265 21 L284 16 L302 25 L320 19 L338 30 L357 34 L376 42 L396 46 L415 53 L435 56 L457 62 L480 66 L500 70 Z" /><line x1="220" y1="2" x2="220" y2="70" /><circle cx="220" cy="8" r="4" /></svg></div>;
}
