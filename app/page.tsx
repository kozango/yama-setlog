"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Ratio = "16:9" | "9:16" | "1:1";
type GpxStyle = "line" | "location" | "profile";
type LabelDensity = "none" | "major" | "detail";

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
  const [gpxName, setGpxName] = useState("yamap_2026-07-31_05_47.gpx");
  const [videoCount, setVideoCount] = useState(6);
  const [generating, setGenerating] = useState(false);

  const totalTime = useMemo(() => {
    if (duration === "auto") return "00:42";
    const value = Number(duration);
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }, [duration]);

  function readGpx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setGpxName(file.name);
  }

  function readVideos(event: ChangeEvent<HTMLInputElement>) {
    const count = event.target.files?.length ?? 0;
    if (count) setVideoCount(count);
  }

  function generate() {
    setGenerating(true);
    window.setTimeout(() => setGenerating(false), 1800);
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
              <span className="upload-copy"><strong>{gpxName}</strong><small>GPXを選択・26.5 km・1泊2日</small></span>
              <span className="complete">✓</span>
              <input type="file" accept=".gpx,application/gpx+xml" onChange={readGpx} />
            </label>
            <label className="upload-row">
              <span className="upload-icon warm">▶</span>
              <span className="upload-copy"><strong>写真・動画を追加</strong><small>まとめて選択できます</small></span>
              <span className="file-count">{videoCount}本</span>
              <input type="file" accept="video/*,image/*" multiple onChange={readVideos} />
            </label>
          </section>

          <section className="setting-section">
            <div className="section-heading"><h2>2. 完成動画の長さ</h2><span>{duration === "auto" ? "おまかせ" : `${duration}秒`}</span></div>
            <div className="choice-row four">
              {["30", "60", "90", "auto"].map((value) => <button type="button" key={value} className={duration === value ? "selected" : ""} onClick={() => setDuration(value)}>{value === "auto" ? "おまかせ" : `${value}秒`}</button>)}
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
          <div className="preview-heading"><strong>完成イメージ</strong><span><i />{videoCount}本すべて紐づけ済み</span></div>
          <div className="stage">
            <div className={`player ratio-${ratio.replace(":", "-")} style-${gpxStyle}`}>
              <div className="scene" aria-hidden="true"><span className="sun" /><span className="mountain far" /><span className="mountain near" /><span className="ridge" /></div>
              <div className="movie-title">山せとろぐ（仮）｜前穂・奥穂</div>
              {showMap && gpxStyle === "line" && <RouteOverlay labels={labels} />}
              {showLocation && gpxStyle !== "profile" && <div className={gpxStyle === "location" ? "location-stamp large" : "location-stamp"}><small>現在地｜DAY 2・06:17</small><strong>穂高岳山荘</strong></div>}
              {showAltitude && gpxStyle !== "profile" && <div className="altitude">3,110 m</div>}
              {gpxStyle === "profile" && <ElevationProfile />}
            </div>
          </div>
          <div className="playback">
            <div className="timeline"><i /></div>
            <div className="time-row"><span>00:26</span><span>{totalTime}</span></div>
            <div className="actions"><span>生成時間：約2分</span><button type="button" onClick={generate} disabled={generating}>{generating ? "構成を作成中…" : "この設定で動画を作る"}</button></div>
          </div>
        </section>
      </div>
    </main>
  );
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
