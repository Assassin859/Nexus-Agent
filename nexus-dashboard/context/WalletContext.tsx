"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { agentFetch } from "@/lib/agent-fetch";

type WalletContextType = {
  walletAddress: string;
  setWalletAddress: (addr: string) => void;
  isConnected: boolean;
  authToken: string | null;
  signInWithEthereum: () => Promise<{ success: boolean; token?: string; error?: string }>;
  disconnectWallet: () => void;
};

const DEFAULT_WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const WalletContext = createContext<WalletContextType>({
  walletAddress: DEFAULT_WALLET,
  setWalletAddress: () => {},
  isConnected: false,
  authToken: null,
  signInWithEthereum: async () => ({ success: false, error: "Not initialized" }),
  disconnectWallet: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddressState] = useState<string>(DEFAULT_WALLET);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Load saved token & wallet on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedToken = localStorage.getItem("nexus_auth_token");
      const savedWallet = localStorage.getItem("nexus_wallet_address");
      if (savedToken) setAuthToken(savedToken);
      if (savedWallet) {
        setWalletAddressState(savedWallet.toLowerCase());
        setIsConnected(true);
      }
    }
  }, []);

  // Listen for MetaMask account changes — clear JWT on disconnect or account switch
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // Disconnected
          disconnectWallet();
        } else {
          const newWallet = accounts[0].toLowerCase();
          if (newWallet !== walletAddress) {
            // Switched account — clear old token
            clearAuthSession();
            setWalletAddressState(newWallet);
            setIsConnected(true);
            localStorage.setItem("nexus_wallet_address", newWallet);
          }
        }
      };

      (window as any).ethereum.on("accountsChanged", handleAccountsChanged);
      return () => {
        try {
          (window as any).ethereum.removeListener("accountsChanged", handleAccountsChanged);
        } catch {}
      };
    }
  }, [walletAddress]);

  function clearAuthSession() {
    setAuthToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("nexus_auth_token");
      localStorage.removeItem("nexus_wallet_address");
    }
  }

  function disconnectWallet() {
    clearAuthSession();
    setIsConnected(false);
    setWalletAddressState(DEFAULT_WALLET);
  }

  function setWalletAddress(addr: string) {
    const formatted = addr.toLowerCase();
    setWalletAddressState(formatted);
    setIsConnected(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("nexus_wallet_address", formatted);
    }
  }

  /**
   * Consolidated SIWE authentication flow:
   * 1. GET /api/auth/challenge
   * 2. personal_sign via MetaMask
   * 3. POST /api/auth/verify
   * 4. Store returned JWT in state and localStorage
   */
  async function signInWithEthereum(): Promise<{ success: boolean; token?: string; error?: string }> {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      return { success: false, error: "MetaMask or Web3 wallet is not detected." };
    }

    try {
      // Step A: Connect accounts
      const accounts: string[] = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        return { success: false, error: "No accounts selected." };
      }
      const address = accounts[0].toLowerCase();
      setWalletAddress(address);

      // Step B: Get Challenge
      const challengeRes = await agentFetch(`/api/auth/challenge?wallet=${address}`);
      if (!challengeRes.ok) throw new Error("Failed to fetch auth challenge from agent.");
      const { challenge } = await challengeRes.json();

      // Step C: Cryptographic Signature via personal_sign
      const signature = await (window as any).ethereum.request({
        method: "personal_sign",
        params: [challenge, address],
      });

      // Step D: Verify with Backend & Receive JWT
      const verifyRes = await agentFetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, signature, challenge }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.token) {
        throw new Error(verifyData.error || "Verification failed");
      }

      // Step E: Store JWT Token
      const token = verifyData.token as string;
      setAuthToken(token);
      localStorage.setItem("nexus_auth_token", token);
      localStorage.setItem("nexus_wallet_address", address);

      return { success: true, token };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "SIWE Sign-In Failed";
      return { success: false, error: errorMsg };
    }
  }

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        setWalletAddress,
        isConnected,
        authToken,
        signInWithEthereum,
        disconnectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
