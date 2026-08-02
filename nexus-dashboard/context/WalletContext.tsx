"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { proxyFetch } from "@/lib/agent-fetch";

type WalletContextType = {
  walletAddress: string;
  setWalletAddress: (addr: string) => void;
  isConnected: boolean;
  authToken: string | null;
  // KeeperHub OAuth session
  khSessionToken: string | null;
  khEmail: string | null;
  signInWithKeeperHub: () => void;
  handleKeeperHubCallback: (token: string, email?: string) => void;
  signOutKeeperHub: () => void;
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
  khSessionToken: null,
  khEmail: null,
  signInWithKeeperHub: () => {},
  handleKeeperHubCallback: () => {},
  signOutKeeperHub: () => {},
  signInWithEthereum: async () => ({ success: false, error: "Not initialized" }),
  disconnectWallet: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddressState] = useState<string>(DEFAULT_WALLET);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [khSessionToken, setKhSessionToken] = useState<string | null>(null);
  const [khEmail, setKhEmail] = useState<string | null>(null);

  // Load saved token, wallet, and KeeperHub session on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedToken = localStorage.getItem("nexus_auth_token");
      const savedWallet = localStorage.getItem("nexus_wallet_address");
      const savedKhToken = localStorage.getItem("nexus_kh_session_token");
      const savedKhEmail = localStorage.getItem("nexus_kh_email");
      if (savedToken) setAuthToken(savedToken);
      if (savedWallet) {
        setWalletAddressState(savedWallet.toLowerCase());
        setIsConnected(true);
      }
      if (savedKhToken) setKhSessionToken(savedKhToken);
      if (savedKhEmail) setKhEmail(savedKhEmail);
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

  /**
   * KeeperHub OAuth: redirect user to KeeperHub website to authenticate.
   * On return, KeeperHub redirects to /auth/keeperhub/callback?token=...&email=...
   * which calls handleKeeperHubCallback() to store the session.
   */
  function signInWithKeeperHub() {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/auth/keeperhub/callback`);
    window.location.href = `https://app.keeperhub.com/auth/authorize?redirect_uri=${callbackUrl}&client=nexusagent`;
  }

  function handleKeeperHubCallback(token: string, email?: string) {
    setKhSessionToken(token);
    if (email) setKhEmail(email);
    localStorage.setItem("nexus_kh_session_token", token);
    if (email) localStorage.setItem("nexus_kh_email", email);
    // OAuth session stored separately — MCP requires a real kh_... API key in settings
  }

  function signOutKeeperHub() {
    setKhSessionToken(null);
    setKhEmail(null);
    localStorage.removeItem("nexus_kh_session_token");
    localStorage.removeItem("nexus_kh_email");
    localStorage.removeItem(`nexus_kh_key_${walletAddress}`);
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
      const challengeRes = await proxyFetch(`/api/auth/challenge?wallet=${address}`);
      if (!challengeRes.ok) throw new Error("Failed to fetch auth challenge from agent.");
      const { challenge } = await challengeRes.json();

      // Step C: Cryptographic Signature via personal_sign
      const signature = await (window as any).ethereum.request({
        method: "personal_sign",
        params: [challenge, address],
      });

      // Step D: Verify with Backend & Receive JWT
      const verifyRes = await proxyFetch("/api/auth/verify", {
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
        khSessionToken,
        khEmail,
        signInWithKeeperHub,
        handleKeeperHubCallback,
        signOutKeeperHub,
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
