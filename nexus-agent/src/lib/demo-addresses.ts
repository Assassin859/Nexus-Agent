/**
 * Demo / testnet wallet addresses for payroll and workflow proofs.
 * Monitored wallet reads Aave; others are PayChain recipients.
 */
export const DEMO_MONITORED_WALLET =
  "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

export const DEMO_PAYROLL_RECIPIENTS = [
  {
    label: "Agentic / vault",
    address: "0xd4106369Aae69A6E704404237fF88b6C5F51Fea2",
    amount: 50,
  },
  {
    label: "Dev wallet A",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    amount: 75,
  },
  {
    label: "Dev wallet B",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    amount: 100,
  },
] as const;

/** Optional self-payroll demo (monitored wallet as recipient). */
export const DEMO_SELF_PAYROLL = {
  label: "Monitored wallet",
  address: DEMO_MONITORED_WALLET,
  amount: 25,
};
