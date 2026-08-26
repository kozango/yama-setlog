import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the mobile Yama Setlog creation flow", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>山せとろぐ（仮）<\/title>/);
  assert.match(html, /山行の30秒ムービーを作る/);
  assert.match(html, /素材を選ぶ/);
  assert.match(html, /仕上がりを選ぶ/);
  assert.match(html, /完成イメージを確認/);
  assert.match(html, /実際のGPX軌跡と撮影時点を表示/);
  assert.match(html, /主要地点/);
  assert.match(html, /詳細/);
  assert.match(html, /地図の位置/);
  assert.match(html, /撮影日時/);
  assert.match(html, /近くの地名/);
  assert.match(html, /キャプション位置/);
  assert.match(html, /GPXを選択すると作成できます/);
  assert.doesNotMatch(html, /北が上・実際のGPX形状|穂高岳山荘|3,110 m|DAY 2/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview/);
});
