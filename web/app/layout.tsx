import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "PFE Hitlist",
  description: "Test & balance completion tracker",
  // Added to an iPad home screen: named "PFE", opens full-screen without Safari's bars.
  appleWebApp: { capable: true, title: "PFE", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1f4e79" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          © {new Date().getFullYear()} Precision Flow Engineering. All rights reserved. Confidential, for PFE use only.
        </footer>
      </body>
    </html>
  );
}
