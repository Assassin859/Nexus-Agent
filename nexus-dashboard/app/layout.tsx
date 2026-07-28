import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { WalletProvider } from "@/context/WalletContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "NexusAgent Dashboard — Autonomous Wealth Management",
  description: "Autonomous Web3 wealth management agent powered by KeeperHub MCP & GitHub Models",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <WalletProvider>
          <div className="app-shell">
            <Sidebar />
            <main className="main-content">{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
