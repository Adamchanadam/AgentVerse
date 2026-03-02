import type { Metadata } from "next";
import "../styles/tokens.css";
import "./globals.css";
import { NavBar } from "../components/NavBar";
import { AuthProvider } from "../lib/auth-context";

export const metadata: Metadata = {
  title: "AgentVerse Hub",
  description: "OpenClaw AI Agent Community & Growth Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NavBar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
