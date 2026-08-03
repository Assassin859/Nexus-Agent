import { generateObject } from "ai";
import { getBrainModel } from "../brain/provider.js";
import {
  CustomWorkflowSchema,
  CUSTOM_WORKFLOW_SYSTEM_PROMPT,
  type CustomWorkflowDecision,
} from "../brain/schemas.js";
import { registerDcaWorkflow } from "./dca-schedule.js";
import { registerGuardianWorkflow } from "./guardian-register.js";
import { registerYieldWorkflow } from "./yield-register.js";
import { handle as handlePaychain } from "./paychain.js";

export type CustomWorkflowRequest = {
  userMessage: string;
  walletAddress: string;
  apiKey?: string;
  conversationHistory?: Array<{ sender: string; text: string }>;
};

export type CustomWorkflowResponse = {
  success: boolean;
  message: string;
  workflowId?: string;
  workflowKind?: CustomWorkflowDecision["recommendation"]["workflow_kind"];
  verificationRequired?: boolean;
};

export async function handleCustomWorkflow(req: CustomWorkflowRequest): Promise<CustomWorkflowResponse> {
  const wallet = req.walletAddress.toLowerCase();
  const { userMessage, conversationHistory = [] } = req;

  const model = getBrainModel();
  const { object } = await generateObject({
    model,
    schema: CustomWorkflowSchema,
    system: CUSTOM_WORKFLOW_SYSTEM_PROMPT,
    prompt: `User request: ${userMessage}`,
  });

  const rec = object.recommendation;

  if (!object.analysis.intentClear) {
    return {
      success: false,
      message: object.userExplanation || "Could not determine workflow type. Try: DCA swap, treasury transfer, guardian monitor, or yield rotation.",
    };
  }

  if (rec.verification_required) {
    return {
      success: false,
      verificationRequired: true,
      workflowKind: rec.workflow_kind,
      message: `${object.userExplanation}\n\nPlease confirm or adjust the amount/recipient before proceeding.`,
    };
  }

  switch (rec.workflow_kind) {
    case "recurring_dca": {
      if (!rec.amount || rec.amount <= 0) {
        return { success: false, message: "DCA workflow requires a positive USDC amount." };
      }
      const res = await registerDcaWorkflow({
        userWallet: wallet,
        amount: rec.amount,
        cronSchedule: rec.schedule,
        message: userMessage,
      });
      return {
        success: res.success,
        message: res.message,
        workflowId: res.workflowId,
        workflowKind: rec.workflow_kind,
      };
    }

    case "recurring_transfer": {
      const addr = rec.recipient_address?.trim();
      if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return { success: false, message: "Treasury transfer requires a valid recipient 0x address." };
      }
      if (!rec.amount || rec.amount <= 0) {
        return { success: false, message: "Treasury transfer requires a positive USDC amount." };
      }
      const payMsg = `pay ${addr} ${rec.amount} USDC ${rec.schedule}`;
      const res = await handlePaychain({
        userMessage: payMsg,
        conversationHistory,
        walletAddress: wallet,
        apiKey: req.apiKey,
      });
      return {
        success: res.success,
        message: res.message,
        workflowId: res.workflowId,
        workflowKind: rec.workflow_kind,
        verificationRequired: res.verification_required,
      };
    }

    case "guardian_monitor": {
      const res = await registerGuardianWorkflow({ userWallet: wallet });
      return {
        success: res.success,
        message: res.message,
        workflowId: res.workflowId,
        workflowKind: rec.workflow_kind,
      };
    }

    case "yield_rotation": {
      const res = await registerYieldWorkflow({ userWallet: wallet });
      return {
        success: res.success,
        message: res.message,
        workflowId: res.workflowId,
        workflowKind: rec.workflow_kind,
      };
    }

    default:
      return { success: false, message: "Unsupported workflow kind." };
  }
}
