"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type WalletContextType = {
  walletAddress: string;
  setWalletAddress: (addr: string) => void;
  isConnected: boolean;
  googleEmail: string;
  signInWithGoogle: (email: string, mpcAddress?: string) => void;
  signOutGoogle: () => void;
};

const WalletContext = createContext<WalletContextType>({
  walletAddress: "",
  setWalletAddress: () => {},
  isConnected: false,
  googleEmail: "",
  signInWithGoogle: () => {},
  signOutGoogle: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddressState] = useState<string>("");
  const [googleEmail, setGoogleEmail] = useState<string>("");

  useEffect(() => {
    const savedWallet = localStorage.getItem("nexus_connected_wallet");
    const savedEmail = localStorage.getItem("nexus_google_email");
    if (savedWallet) setWalletAddressState(savedWallet);
    if (savedEmail) setGoogleEmail(savedEmail);

    if (typeof window !== "undefined" && (window as any).ethereum) {
      const eth = (window as any).ethereum;
      eth.request({ method: "eth_accounts" }).then((accounts: string[]) => {
        if (accounts.length > 0 && !savedEmail) {
          const addr = accounts[0].toLowerCase();
          setWalletAddressState(addr);
          localStorage.setItem("nexus_connected_wallet", addr);
        }
      }).catch(() => {});
    }
  }, []);

  function setWalletAddress(addr: string) {
    const normalized = addr.toLowerCase();
    setWalletAddressState(normalized);
    localStorage.setItem("nexus_connected_wallet", normalized);
  }

  function signInWithGoogle(email: string, mpcAddress?: string) {
    const targetAddr = (mpcAddress || process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b").toLowerCase();
    setGoogleEmail(email);
    setWalletAddressState(targetAddr);
    localStorage.setItem("nexus_google_email", email);
    localStorage.setItem("nexus_connected_wallet", targetAddr);
    localStorage.setItem(`nexus_kh_key_${targetAddr}`, "kh_authenticated_google");
  }

  function signOutGoogle() {
    setGoogleEmail("");
    localStorage.removeItem("nexus_google_email");
  }

  const FALLBACK = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b").toLowerCase();
  const effective = walletAddress || FALLBACK;

  return (
    <WalletContext.Provider value={{
      walletAddress: effective,
      setWalletAddress,
      isConnected: !!walletAddress || !!googleEmail,
      googleEmail,
      signInWithGoogle,
      signOutGoogle,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
