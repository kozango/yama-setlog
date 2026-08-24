"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Ratio = "16:9" | "9:16" | "1:1";
type LabelDensity = "none" | "major" | "detail";
type MapPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type GenerationState = "idle" | "exporting" | "ready" | "error";
type PreviewMode = "clip" | "sequence";
type GpxPoint = { index: number; lat: number; lon: number; ele: number; time: number; name: string | null };
type GpxData = { name: string; points: GpxPoint[]; startTime: number; endTime: number };
type PlaceGpxPoint = { lat: number; lon: number; name: string };
type PlaceGpxData = { name: string; points: PlaceGpxPoint[] };
type MediaItem = {
  id: string;
  name: string;
  detail: string;
  selected: boolean;
  kind: "video" | "image";
  url: string;
  file: File;
  capturedAt: number;
  capturedAtSource: "metadata" | "file";
  durationSeconds: number | null;
  point: GpxPoint | null;
  pointGapMinutes: number | null;
  placeName: string | null;
  caption: string;
};

export default function Home() {
  const [duration, setDuration] = useState("30");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [showRoute, setShowRoute] = useState(true);
  const [labelDensity, setLabelDensity] = useState<LabelDensity>("major");
  const [mapPosition, setMapPosition] = useState<MapPosition>("top-right");
  const [showDateTime, setShowDateTime] = useState(true);
  const [showPlace, setShowPlace] = useState(true);
  const [gpxName, setGpxName] = useState("");
  const [routeGpxData, setRouteGpxData] = useState<GpxData | null>(null);
  const [gpxError, setGpxError] = useState("");
  const [placeGpxName, setPlaceGpxName] = useState("");
  const [placeGpxData, setPlaceGpxData] = useState<PlaceGpxData | null>(null);
  const [placeGpxError, setPlaceGpxError] = useState("");
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

  const placeMerge = useMemo(() => routeGpxData ? mergePlaceNames(routeGpxData, placeGpxData) : null, [routeGpxData, placeGpxData]);
  const gpxData = placeMerge?.data ?? null;
  const selectedMedia = useMemo(() => media.filter(item => item.selected), [media]);
  const previewMedia = selectedMedia.find(item => item.id === previewId) ?? selectedMedia[0];
  const hasNamedPlaces = Boolean(gpxData?.points.some(point => point.name));

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
    try {
      const parsed = parseGpx(await file.text());
      setGpxName(file.name);
      setRouteGpxData(parsed);
      setGpxError("");
      setPlaceGpxName("");
      setPlaceGpxData(null);
      setPlaceGpxError("");
      setMedia(items => matchAndSortMedia(items, parsed));
      resetGeneration();
      stopSequence();
    } catch (error) {
      setGpxName("");
      setRouteGpxData(null);
      setPlaceGpxName("");
      setPlaceGpxData(null);
      setPlaceGpxError("");
      setMedia(items => matchAndSortMedia(items, null));
      setGpxError(error instanceof Error ? error.message : "GPXを読み込めませんでした。");
      resetGeneration();
      stopSequence();
    }
  }

  async function readPlaceGpx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !routeGpxData) return;
    try {
      const parsed = parsePlaceGpx(await file.text());
      const merged = mergePlaceNames(routeGpxData, parsed);
      if (!merged.matched) throw new Error("ルートから500m以内に一致する地名がありませんでした。");
      setPlaceGpxName(file.name);
      setPlaceGpxData(parsed);
      setPlaceGpxError("");
      setMedia(items => matchAndSortMedia(items, merged.data));
      resetGeneration();
      stopSequence();
    } catch (error) {
      setPlaceGpxName("");
      setPlaceGpxData(null);
      setMedia(items => matchAndSortMedia(items, routeGpxData));
      setPlaceGpxError(error instanceof Error ? error.message : "地名GPXを読み込めませんでした。");
      resetGeneration();
      stopSequence();
    } finally {
      event.target.value = "";
    }
  }

  function clearPlaceGpx() {
    if (!routeGpxData) return;
    setPlaceGpxName("");
    setPlaceGpxData(null);
    setPlaceGpxError("");
    setMedia(items => matchAndSortMedia(items, routeGpxData));
    resetGeneration();
    stopSequence();
  }

  async function readVideos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    const next = await Promise.all(files.map(async (file, index): Promise<MediaItem> => {
      const capture = await mediaCapturedAt(file);
      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        detail: `${formatBytes(file.size)}・端末上で読み込み済み`,
        selected: true,
        kind: file.type.startsWith("image/") ? "image" as const : "video" as const,
        url: URL.createObjectURL(file),
        file,
        capturedAt: capture.timestamp,
        capturedAtSource: capture.source,
        durationSeconds: null,
        point: null,
        pointGapMinutes: null,
        placeName: null,
        caption: "",
      };
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
    if (!gpxData || !selectedMedia.length || generationBusy) return;
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
        showRoute,
        labelDensity,
        mapPosition,
        showDateTime,
        showPlace,
        gpx: gpxData,
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

  function updateCaption(id: string, caption: string) {
    setMedia(items => items.map(item => item.id === id ? { ...item, caption } : item));
    resetGeneration();
  }

  if (generationState === "exporting") return <main className="phone-app"><header className="phone-header"><strong>山せとろぐ（仮）</strong></header><section className="processing-screen"><div className="processing-ring" style={{ "--progress": `${generationProgress * 3.6}deg` } as { "--progress": string }}><span>{generationProgress}%</span></div><h1>完成動画を書き出しています</h1><p>{targetSeconds}秒版は、およそ{targetSeconds}秒で完成します。<br />この画面を閉じずにお待ちください。</p><div className="generation-progress"><i style={{ width: `${generationProgress}%` }} /></div></section></main>;

  if (generationState === "ready" && output) return <main className="phone-app">
    <header className="phone-header"><strong>山せとろぐ（仮）</strong></header>
    <section className="result-screen">
      <span className="result-check">✓</span><h1>完成しました</h1><p>{targetSeconds}秒・{formatBytes(output.size)}</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video className="result-video" src={output.url} controls playsInline />
      <a className="download-action" href={output.url} download={output.name}>完成動画を端末に保存</a>
      <button type="button" className="text-action" onClick={resetGeneration}>設定を変えて作り直す</button>
    </section>
  </main>;

  return <main className="phone-app">
    <header className="phone-header"><strong>山せとろぐ（仮）</strong><span>端末内で作成</span></header>
    <div className="phone-content">
      <section className="phone-intro"><small>GPX × 撮影素材</small><h1>山行の30秒ムービーを作る</h1><p>撮影日時・近くの地名・実際のルートを自動表示。キャプションは必要な素材だけ追加できます。</p></section>

      <section className="phone-card">
        <div className="phone-step"><i>1</i><span><strong>素材を選ぶ</strong><small>GPXと写真・動画の両方が必要です</small></span></div>
        <label className="phone-upload"><span className="upload-icon">⌁</span><span className="upload-copy"><strong>{gpxName || "ルートGPXを選択"}</strong><small>{gpxData ? `${gpxData.points.length}地点・${formatLocalDateTime(gpxData.startTime)}から` : "軌跡と撮影時刻に使います"}</small></span><b className={gpxData ? "upload-ok" : ""}>{gpxData ? "✓" : "選択"}</b><input type="file" accept=".gpx,application/gpx+xml" onChange={readGpx} /></label>
        {gpxError && <p className="inline-error">{gpxError}</p>}
        {routeGpxData && <div className="place-gpx-row"><label className="phone-upload place-gpx-upload"><span className="upload-icon place">＋</span><span className="upload-copy"><strong>{placeGpxName || "地名GPXを追加（任意）"}</strong><small>{placeGpxData ? `${placeMerge?.matched ?? 0}地点をルートへ合成` : "山レコ等から地名だけを合成します"}</small></span><b className={placeGpxData ? "upload-ok" : ""}>{placeGpxData ? "変更" : "追加"}</b><input type="file" accept=".gpx,application/gpx+xml" onChange={readPlaceGpx} /></label>{placeGpxData && <button type="button" className="place-gpx-clear" onClick={clearPlaceGpx}>地名を外す</button>}</div>}
        {placeGpxError && <p className="inline-error">{placeGpxError}</p>}
        <label className="phone-upload"><span className="upload-icon warm">▶</span><span className="upload-copy"><strong>写真・動画を選択</strong><small>{media.length ? `${media.length}本を撮影日時順に整理済み` : "まとめて選択できます"}</small></span><b className={media.length ? "upload-ok" : ""}>{media.length ? `${selectedMedia.length}本` : "選択"}</b><input type="file" accept="video/*,image/*" multiple onChange={readVideos} /></label>
        <div className="ready-checks"><span className={gpxData ? "done" : ""}>{gpxData ? "✓" : "1"} GPX</span><i /><span className={selectedMedia.length ? "done" : ""}>{selectedMedia.length ? "✓" : "2"} 動画</span><i /><span className={gpxData && selectedMedia.length ? "done" : ""}>{gpxData && selectedMedia.length ? "✓" : "3"} 作成可能</span></div>
      </section>

      {media.length > 0 && <section className="phone-card media-card"><button type="button" className="media-disclosure" onClick={() => setMediaOpen(open => !open)} aria-expanded={mediaOpen}><span>使用する素材</span><strong>{selectedMedia.length}本・撮影日時順</strong><i>{mediaOpen ? "−" : "+"}</i></button>{mediaOpen && <><div className="media-bulk-actions"><button type="button" onClick={() => setAllMedia(true)}>すべて選択</button><button type="button" onClick={() => setAllMedia(false)}>すべて解除</button></div><div className="media-list">{media.map((item, index) => <div className={item.id === previewMedia?.id ? "media-item previewing" : "media-item"} key={item.id}><label className="media-check"><input type="checkbox" checked={item.selected} onChange={() => toggleMedia(item.id)} /><span className="check-mark">✓</span><span className="media-order">{String(index + 1).padStart(2, "0")}</span><span className="media-copy"><strong>{item.name}</strong><small>{item.detail}</small></span></label><button type="button" className="preview-target" disabled={!item.selected} onClick={() => showClip(item.id)}>見る</button></div>)}</div></>}</section>}

      <section className="phone-card">
        <div className="phone-step"><i>2</i><span><strong>仕上がりを選ぶ</strong><small>スマホ向けは縦30秒がおすすめです</small></span></div>
        <div className="compact-label">長さ</div><div className="choice-row four">{["30", "60", "90", "auto"].map(value => <button type="button" key={value} className={duration === value ? "selected" : ""} onClick={() => { setDuration(value); stopSequence(); resetGeneration(); }}>{value === "auto" ? "おまかせ" : `${value}秒`}</button>)}</div>
        <div className="compact-label">画面</div><div className="choice-row three">{(["9:16", "16:9", "1:1"] as Ratio[]).map(value => <button type="button" key={value} className={ratio === value ? "selected" : ""} onClick={() => setRatio(value)}>{value === "9:16" ? "縦" : value === "16:9" ? "横" : "正方形"}</button>)}</div>
        <button type="button" className={showRoute ? "route-toggle selected" : "route-toggle"} aria-pressed={showRoute} onClick={() => { setShowRoute(value => !value); resetGeneration(); }}><span><strong>ルート地図</strong><small>実際のGPX軌跡と撮影時点を表示</small></span><i>{showRoute ? "ON" : "OFF"}</i></button>
        {showRoute && <><div className="compact-label">地名</div><div className="choice-row three">{([{ value: "none", label: "なし" }, { value: "major", label: "主要地点" }, { value: "detail", label: "詳細" }] as { value: LabelDensity; label: string }[]).map(option => <button type="button" key={option.value} className={labelDensity === option.value ? "selected" : ""} onClick={() => { setLabelDensity(option.value); resetGeneration(); }}>{option.label}</button>)}</div></>}
        {showRoute && <><div className="compact-label">地図の位置</div><div className="choice-row four">{([{ value: "top-left", label: "左上" }, { value: "top-right", label: "右上" }, { value: "bottom-left", label: "左下" }, { value: "bottom-right", label: "右下" }] as { value: MapPosition; label: string }[]).map(option => <button type="button" key={option.value} className={mapPosition === option.value ? "selected" : ""} onClick={() => { setMapPosition(option.value); resetGeneration(); }}>{option.label}</button>)}</div></>}
        <div className="compact-label">表示する情報</div><div className="info-toggle-row"><button type="button" className={showDateTime ? "selected" : ""} aria-pressed={showDateTime} onClick={() => { setShowDateTime(value => !value); resetGeneration(); }}><span><strong>撮影日時</strong><small>動画内の時刻</small></span><i>{showDateTime ? "ON" : "OFF"}</i></button><button type="button" className={showPlace && hasNamedPlaces ? "selected" : ""} aria-pressed={showPlace && hasNamedPlaces} disabled={!hasNamedPlaces} onClick={() => { setShowPlace(value => !value); resetGeneration(); }}><span><strong>近くの地名</strong><small>{hasNamedPlaces ? "GPXから取得" : "GPXに地名なし"}</small></span><i>{showPlace && hasNamedPlaces ? "ON" : "OFF"}</i></button></div>
      </section>

      <section className="phone-card preview-card">
        <div className="phone-step"><i>3</i><span><strong>完成イメージを確認</strong><small>書き出す前に{targetSeconds}秒をそのまま再生できます</small></span></div>
        <div className={`phone-player ratio-${ratio.replace(":", "-")} map-${mapPosition}`}>{previewMedia?.url ? previewMedia.kind === "video" ? <video className="uploaded-media" key={`${previewMode}-${previewMedia.url}`} src={previewMedia.url} controls={previewMode === "clip"} playsInline autoPlay muted loop={previewMode === "sequence"} onEnded={() => { if (previewMode === "clip") movePreview(1); }} onLoadedMetadata={event => updateDuration(previewMedia.id, event.currentTarget.duration)} /> : <img className="uploaded-media" src={previewMedia.url} alt={previewMedia.name} /> : <div className="empty-player">動画を選択すると<br />ここで確認できます</div>}{showRoute && gpxData && <GpxRouteOverlay gpx={gpxData} current={previewMedia?.point ?? null} density={labelDensity} position={mapPosition} />}{previewMedia?.caption && <div className="clip-caption">{previewMedia.caption}</div>}{previewMedia && (showDateTime || showPlace) && <div className="capture-meta">{showDateTime && <time>{formatOutputDateTime(previewMedia.capturedAt)}</time>}{showPlace && previewMedia.placeName && <span>{previewMedia.placeName}付近</span>}</div>}</div>
        <div className="preview-meta"><span>{previewMode === "sequence" ? "完成プレビュー" : previewMedia?.name || "素材未選択"}</span><b>{previewMedia ? `${selectedMedia.findIndex(item => item.id === previewMedia.id) + 1}/${selectedMedia.length}` : ""}</b></div>
        {previewMedia && previewMode === "clip" && <div className="caption-field"><span><strong>この素材のキャプション</strong><small>任意・空欄なら表示しません</small></span><input aria-label={`${previewMedia.name}のキャプション`} value={previewMedia.caption} maxLength={48} placeholder="例：朝日に染まる稜線" onChange={event => updateCaption(previewMedia.id, event.target.value)} /></div>}
        <div className="timeline active"><i style={{ width: previewMode === "sequence" ? `${sequenceProgress}%` : "0%" }} /></div><div className="time-row"><span>{previewMode === "sequence" ? formatClock(targetSeconds * sequenceProgress / 100) : "00:00"}</span><span>{totalTime}</span></div>
        <button type="button" className="preview-action" onClick={startSequence} disabled={!selectedMedia.length}>{sequencePlaying ? `再生中 ${Math.round(sequenceProgress)}%` : `▶ ${targetSeconds}秒の完成イメージを見る`}</button>
      </section>

      {generationState === "error" && <p className="inline-error export-error">{generationError}</p>}
    </div>
    <div className="phone-cta"><p>{!gpxData ? "GPXを選択すると作成できます" : !selectedMedia.length ? "動画を1本以上選択してください" : `書き出しには約${targetSeconds}秒かかります`}</p><button type="button" onClick={generate} disabled={!gpxData || !selectedMedia.length}>{generationState === "error" ? "もう一度書き出す" : `${targetSeconds}秒動画を書き出す`}</button></div>
  </main>;
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
    const pointName = node.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || null;
    return { index, lat: Number(node.getAttribute("lat")), lon: Number(node.getAttribute("lon")), ele: Number(eleText), time: Date.parse(timeText), name: pointName };
  }).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon) && Number.isFinite(point.time));
  if (!points.length) throw new Error("時刻付きの軌跡がGPXに見つかりませんでした。");
  points.forEach((point, index) => { point.index = index; });
  const track = documentNode.getElementsByTagNameNS("*", "trk")[0];
  const name = track?.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || "山行記録";
  return { name, points, startTime: points[0].time, endTime: points[points.length - 1].time };
}

function parsePlaceGpx(xml: string): PlaceGpxData {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("地名GPXを読み込めませんでした。");
  const pointNodes = ["trkpt", "wpt", "rtept"].flatMap(tag => Array.from(documentNode.getElementsByTagNameNS("*", tag)));
  const seen = new Set<string>();
  const points = pointNodes.flatMap(node => {
    const name = node.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim();
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(name)) return [];
    seen.add(name);
    return [{ lat, lon, name }];
  });
  if (!points.length) throw new Error("このGPXには座標付きの地名がありませんでした。");
  const track = documentNode.getElementsByTagNameNS("*", "trk")[0];
  const name = track?.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() || "地名GPX";
  return { name, points };
}

function mergePlaceNames(route: GpxData, places: PlaceGpxData | null) {
  if (!places) return { data: route, matched: 0 };
  const points = route.points.map(point => ({ ...point }));
  const used = new Set<number>();
  let matched = 0;
  for (const place of places.points) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      if (used.has(index)) return;
      const distance = haversineMeters(place, point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex < 0 || nearestDistance > 500) continue;
    if (!points[nearestIndex].name) points[nearestIndex].name = place.name;
    used.add(nearestIndex);
    matched += 1;
  }
  return { data: { ...route, points }, matched };
}

function matchAndSortMedia(items: MediaItem[], gpx: GpxData | null) {
  return items.map(item => {
    const point = gpx ? nearestPoint(gpx.points, item.capturedAt) : null;
    const insideActivity = Boolean(gpx && item.capturedAt >= gpx.startTime && item.capturedAt <= gpx.endTime);
    const gapMinutes = point ? Math.round(Math.abs(point.time - item.capturedAt) / 60000) : null;
    const matchedPoint = insideActivity ? point : null;
    const next = { ...item, point: matchedPoint, pointGapMinutes: insideActivity ? gapMinutes : null, placeName: gpx && matchedPoint ? nearestPlaceName(gpx.points, matchedPoint) : null };
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

function formatLocalDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
}

function formatOutputDateTime(timestamp: number) {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}.${value("month")}.${value("day")} ${value("hour")}:${value("minute")}`;
}

function mediaDetail(item: MediaItem, durationSeconds: number | null) {
  const duration = durationSeconds === null ? "" : `${formatDuration(durationSeconds)}・`;
  const source = item.capturedAtSource === "metadata" ? "動画内の撮影時刻" : "ファイルの日時";
  const match = item.placeName ? `${item.placeName}付近` : item.point ? item.pointGapMinutes && item.pointGapMinutes > 15 ? "GPX停止区間・最寄り地点を使用" : "GPXに反映済み" : "GPXの活動時間外";
  return `${duration}${formatOutputDateTime(item.capturedAt)}・${source}・${match}`;
}

function GpxRouteOverlay({ gpx, current, density, position }: { gpx: GpxData; current: GpxPoint | null; density: LabelDensity; position: MapPosition }) {
  const projected = projectRoute(gpx.points, 100, 100, 8);
  if (projected.length < 2) return null;
  const path = routePath(projected);
  const currentIndex = current?.index ?? 0;
  const travelled = routePath(projected.slice(0, currentIndex + 1));
  const currentPoint = projected[Math.min(projected.length - 1, currentIndex)];
  const start = projected[0];
  const end = projected[projected.length - 1];
  const labels = selectRouteLabels(gpx.points, projected, density);
  return <svg className={`route-map-overlay map-${position}`} viewBox="0 0 100 100" role="img" aria-label="GPXルートと撮影時点">
    <path className="route-map-full" d={path} />
    <path className="route-map-travelled" d={travelled} />
    <circle className="route-map-end" cx={start.x} cy={start.y} r="1.8" />
    <circle className="route-map-end" cx={end.x} cy={end.y} r="1.8" />
    {labels.map(label => <g className="route-map-label" key={`${label.index}-${label.name}`}><circle cx={label.x} cy={label.y} r=".75" /><text x={label.x > 72 ? Math.max(8, label.x - 2.2) : Math.min(92, label.x + 2.2)} y={Math.max(6, label.y - 1.7)} textAnchor={label.x > 72 ? "end" : "start"}>{label.name}</text></g>)}
    {current && <><circle className="route-map-pulse" cx={currentPoint.x} cy={currentPoint.y} r="5" /><circle className="route-map-current" cx={currentPoint.x} cy={currentPoint.y} r="2.6" /></>}
  </svg>;
}

function projectRoute(points: GpxPoint[], width: number, height: number, padding: number) {
  if (!points.length) return [];
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const longitudeScale = Math.cos(meanLat * Math.PI / 180);
  const raw = points.map(point => ({ x: point.lon * longitudeScale, y: -point.lat }));
  const xs = raw.map(point => point.x);
  const ys = raw.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, Number.EPSILON);
  const spanY = Math.max(maxY - minY, Number.EPSILON);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return raw.map(point => ({ x: offsetX + (point.x - minX) * scale, y: offsetY + (point.y - minY) * scale }));
}

function routePath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function selectRouteLabels(points: GpxPoint[], projected: { x: number; y: number }[], density: LabelDensity) {
  if (density === "none") return [];
  const unique = new Map<string, { index: number; name: string; x: number; y: number; score: number }>();
  points.forEach((point, index) => {
    if (!point.name || !projected[index]) return;
    const name = displayPlaceName(point.name);
    if (!name || unique.has(name)) return;
    unique.set(name, { index, name, x: projected[index].x, y: projected[index].y, score: placePriority(name) });
  });
  const candidates = [...unique.values()];
  const limit = density === "major" ? 5 : 10;
  const selected: typeof candidates = [];
  while (selected.length < limit && selected.length < candidates.length) {
    const remaining = candidates.filter(candidate => !selected.includes(candidate));
    const next = remaining.reduce((best, candidate) => {
      const distance = selected.length ? Math.min(...selected.map(item => Math.hypot(item.x - candidate.x, item.y - candidate.y))) : 20;
      const value = distance + candidate.score * (density === "major" ? 3 : 1.5);
      const bestDistance = selected.length ? Math.min(...selected.map(item => Math.hypot(item.x - best.x, item.y - best.y))) : 20;
      const bestValue = bestDistance + best.score * (density === "major" ? 3 : 1.5);
      return value > bestValue ? candidate : best;
    });
    selected.push(next);
  }
  return selected.sort((a, b) => a.index - b.index);
}

function displayPlaceName(name: string) {
  return name.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function nearestPlaceName(points: GpxPoint[], current: GpxPoint) {
  const named = points.filter((point): point is GpxPoint & { name: string } => Boolean(point.name));
  if (!named.length) return null;
  const nearest = named.reduce((best, point) => haversineMeters(current, point) < haversineMeters(current, best) ? point : best);
  return haversineMeters(current, nearest) <= 2500 ? displayPlaceName(nearest.name) : null;
}

function haversineMeters(a: Pick<GpxPoint, "lat" | "lon">, b: Pick<GpxPoint, "lat" | "lon">) {
  const radius = 6_371_000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLon = (b.lon - a.lon) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function placePriority(name: string) {
  let score = 0;
  if (/(岳|山|峰|頂|峠)/.test(name)) score += 4;
  if (/(山荘|小屋|登山口|分岐)/.test(name)) score += 3;
  if (/(沢|橋|横尾|涸沢|徳澤|上高地)/.test(name)) score += 2;
  if (/(トイレ|公衆)/.test(name)) score -= 5;
  return score;
}

async function mediaCapturedAt(file: File) {
  if (file.type.startsWith("video/") || /\.(mov|mp4|m4v)$/i.test(file.name)) {
    const timestamp = await quickTimeCreationTime(file);
    if (timestamp !== null) return { timestamp, source: "metadata" as const };
  }
  return { timestamp: file.lastModified, source: "file" as const };
}

async function quickTimeCreationTime(file: File) {
  const windowSize = 8 * 1024 * 1024;
  const ranges = file.size <= windowSize * 2
    ? [[0, file.size]]
    : [[0, windowSize], [file.size - windowSize, file.size]];
  for (const [start, end] of ranges) {
    const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
    for (let index = 4; index + 16 < bytes.length; index += 1) {
      if (bytes[index] !== 0x6d || bytes[index + 1] !== 0x76 || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64) continue;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const atomSize = view.getUint32(index - 4);
      const version = view.getUint8(index + 4);
      if (atomSize < 20 || (version !== 0 && version !== 1)) continue;
      const seconds = version === 1 ? Number(view.getBigUint64(index + 8)) : view.getUint32(index + 8);
      const timestamp = (seconds - 2_082_844_800) * 1000;
      if (timestamp >= Date.UTC(1990, 0, 1) && timestamp <= Date.UTC(2100, 0, 1)) return timestamp;
    }
  }
  return null;
}

type ExportOptions = {
  items: MediaItem[];
  seconds: number;
  ratio: Ratio;
  showRoute: boolean;
  labelDensity: LabelDensity;
  mapPosition: MapPosition;
  showDateTime: boolean;
  showPlace: boolean;
  gpx: GpxData;
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
  if (options.showRoute) drawRouteMap(context, canvas, options.gpx, item.point, options.labelDensity, options.mapPosition);
  if (item.caption) drawCaption(context, canvas, item.caption, options.mapPosition);
  if (options.showDateTime || options.showPlace) drawMetadata(context, canvas, item, options.showDateTime, options.showPlace);
}

function drawRouteMap(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, gpx: GpxData, current: GpxPoint | null, density: LabelDensity, position: MapPosition) {
  const size = Math.min(canvas.width * .35, canvas.height * .42);
  const left = position.endsWith("left") ? canvas.width * .035 : canvas.width - size - canvas.width * .035;
  const top = position.startsWith("top") ? canvas.height * .035 : canvas.height - size - canvas.height * .16;
  const points = projectRoute(gpx.points, size, size, size * .09);
  if (points.length < 2) return;
  context.save();
  context.shadowColor = "rgba(0,0,0,.68)";
  context.shadowBlur = Math.max(3, size * .025);
  const drawPath = (until: number, color: string, lineWidth: number) => {
    context.beginPath();
    points.slice(0, until + 1).forEach((point, index) => index ? context.lineTo(left + point.x, top + point.y) : context.moveTo(left + point.x, top + point.y));
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  };
  drawPath(points.length - 1, "rgba(255,255,255,.35)", Math.max(1.5, size * .012));
  if (current) drawPath(current.index, "rgba(255,255,255,.96)", Math.max(2.5, size * .021));
  const labels = selectRouteLabels(gpx.points, points, density);
  context.font = `700 ${Math.max(9, size * .04)}px sans-serif`;
  context.textBaseline = "middle";
  context.lineJoin = "round";
  for (const label of labels) {
    const x = left + label.x;
    const y = top + label.y;
    context.beginPath();
    context.arc(x, y, size * .011, 0, Math.PI * 2);
    context.fillStyle = "white";
    context.fill();
    context.textAlign = label.x > size * .72 ? "right" : "left";
    const textX = x + (label.x > size * .72 ? -size * .025 : size * .025);
    context.strokeStyle = "rgba(3,12,9,.88)";
    context.lineWidth = Math.max(1.2, size * .007);
    context.strokeText(label.name, textX, y - size * .025);
    context.fillStyle = "white";
    context.fillText(label.name, textX, y - size * .025);
  }
  const endpointRadius = size * .01;
  for (const point of [points[0], points[points.length - 1]]) {
    context.beginPath();
    context.arc(left + point.x, top + point.y, endpointRadius, 0, Math.PI * 2);
    context.fillStyle = "white";
    context.fill();
  }
  if (current) {
    const point = points[Math.min(points.length - 1, current.index)];
    context.beginPath();
    context.arc(left + point.x, top + point.y, size * .04, 0, Math.PI * 2);
    context.fillStyle = "rgba(255,255,255,.22)";
    context.fill();
    context.beginPath();
    context.arc(left + point.x, top + point.y, size * .02, 0, Math.PI * 2);
    context.fillStyle = "white";
    context.fill();
  }
  context.restore();
}

function drawCaption(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, caption: string, mapPosition: MapPosition) {
  const fontSize = Math.max(18, canvas.width * .042);
  const maxWidth = canvas.width * .78;
  context.save();
  context.font = `700 ${fontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = wrapCanvasText(context, caption, maxWidth).slice(0, 2);
  const lineHeight = fontSize * 1.35;
  const padX = fontSize * .75;
  const padY = fontSize * .5;
  const textWidth = Math.max(...lines.map(line => context.measureText(line).width));
  const boxWidth = textWidth + padX * 2;
  const boxHeight = lines.length * lineHeight + padY * 2;
  const centerY = mapPosition.startsWith("bottom") ? canvas.height * .16 : canvas.height * .77;
  context.fillStyle = "rgba(7,15,12,.68)";
  context.beginPath();
  context.roundRect((canvas.width - boxWidth) / 2, centerY - boxHeight / 2, boxWidth, boxHeight, fontSize * .45);
  context.fill();
  context.fillStyle = "white";
  lines.forEach((line, index) => context.fillText(line, canvas.width / 2, centerY + (index - (lines.length - 1) / 2) * lineHeight));
  context.restore();
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const character of text.trim()) {
    const next = current + character;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = character;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawMetadata(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, item: MediaItem, showDateTime: boolean, showPlace: boolean) {
  const lines = [showDateTime ? formatOutputDateTime(item.capturedAt) : "", showPlace && item.placeName ? `${item.placeName}付近` : ""].filter(Boolean);
  if (!lines.length) return;
  const fontSize = Math.max(12, canvas.width * .026);
  const lineHeight = fontSize * 1.35;
  const padX = canvas.width * .018;
  const padY = fontSize * .55;
  context.save();
  context.font = `700 ${fontSize}px sans-serif`;
  const textWidth = Math.max(...lines.map(line => context.measureText(line).width));
  const boxWidth = textWidth + padX * 2;
  const boxHeight = lines.length * lineHeight + padY * 2;
  const left = canvas.width * .045;
  const bottom = canvas.height * .94;
  context.fillStyle = "rgba(7,15,12,.68)";
  context.beginPath();
  context.roundRect(left, bottom - boxHeight, boxWidth, boxHeight, fontSize * .4);
  context.fill();
  context.fillStyle = "white";
  context.textAlign = "left";
  context.textBaseline = "middle";
  lines.forEach((line, index) => context.fillText(line, left + padX, bottom - boxHeight + padY + lineHeight * (index + .5)));
  context.restore();
}
