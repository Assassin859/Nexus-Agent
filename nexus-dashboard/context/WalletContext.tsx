"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type WalletContextType = {
  walletAddress: string;
  setWalletAddress: (addr: string) => void;
  isConnected: boolean;
};

const WalletContext = createContext<WalletContextType>({
  walletAddress: "",
  setWalletAddress: () => {},
  isConnected: false,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddressState] = useState<string>("");

  // On mount: restore from localStorage, then check if MetaMask is still connected
  useEffect(() => {
    const saved = localStorage.getItem("nexus_connected_wallet");
    if (saved) {
      setWalletAddressState(saved);
    }

    // Auto-detect MetaMask active account changes
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const eth = (window as any).ethereum;

      // Sync current accounts if already connected
      eth.request({ method: "eth_accounts" }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          const addr = accounts[0].toLowerCase();
          setWalletAddressState(addr);
          localStorage.setItem("nexus_connected_wallet", addr);
        }
      }).catch(() => {});

      // Listen for account switch
      eth.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length > 0) {
          const addr = accounts[0].toLowerCase();
          setWalletAddressState(addr);
          localStorage.setItem("nexus_connected_wallet", addr);
        } else {
          setWalletAddressState("");
          localStorage.removeItem("nexus_connected_wallet");
        }
      });
    }
  }, []);

  function setWalletAddress(addr: string) {
    const normalized = addr.toLowerCase();
    setWalletAddressState(normalized);
    localStorage.setItem("nexus_connected_wallet", normalized);
  }

  const FALLBACK = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b").toLowerCase();
  const effective = walletAddress || FALLBACK;

  return (
    <WalletContext.Provider value={{ walletAddress: effective, setWalletAddress, isConnected: !!walletAddress }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
