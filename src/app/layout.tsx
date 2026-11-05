import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_Sinhala, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

const notoSinhala = Noto_Sans_Sinhala({
  variable: "--font-noto-sinhala",
  subsets: ["latin", "sinhala"],
  display: "swap",
});

const notoTamil = Noto_Sans_Tamil({
  variable: "--font-noto-tamil",
  subsets: ["latin", "tamil"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "kaluwo — Sri Lankan discussion forum",
  description:
    "A classic discussion forum for Sri Lanka, in Sinhala, Tamil and English.",
};

// Apply a stored or system theme before the page paints, so dark mode does not
// flash a light page on load. The toggle persists the choice in localStorage.
const themeScript = `(function () {
  try {
    var saved = localStorage.getItem("theme");
    var dark =
      saved === "dark" ||
      (saved !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (error) {
    document.documentElement.classList.toggle(
      "dark",
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${notoSinhala.variable} ${notoTamil.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
