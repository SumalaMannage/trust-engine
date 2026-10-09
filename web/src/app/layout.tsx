import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageFooter } from "@/components/layout/PageFooter";
import "./globals.css";
import styles from "./layout.module.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Trust Engine", template: "%s · Trust Engine" },
  description: "Check a suspicious message, link, file or payment slip before you pay or hand over goods.",
};

export const viewport: Viewport = {
  themeColor: "#3d6a99",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={styles.body}>
        <AppHeader />
        <main className={styles.main}>{children}</main>
        <PageFooter />
      </body>
    </html>
  );
}
