import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "山せとろぐ（仮）",
  description: "GPXと撮影素材から、ルートと同期した山行ムービーを作るプロトタイプ。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
