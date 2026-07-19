"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { OnboardingStatus } from "@/lib/onboarding/status";
import { getOnboardingStatusAction } from "../actions";
import { Step1Credentials } from "./step1-credentials";
import { Step2Webhook } from "./step2-webhook";
import { Step3TestMessage } from "./step3-test-message";
import { Step4Complete } from "./step4-complete";

export function Wizard({
  initialStatus,
  webhook,
  savedCreds,
}: {
  initialStatus: OnboardingStatus;
  webhook: { url: string; token: string };
  savedCreds: {
    phoneId: string;
    wabaId: string;
    appId: string;
    hasToken: boolean;
    hasSecret: boolean;
  };
}) {
  const [step, setStep] = useState<number>(initialStatus.nextStep ?? 4);
  const [status, setStatus] = useState<OnboardingStatus>(initialStatus);
  const pollingRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const isPolling = step === 2 && !status.steps.webhookVerified;

  // Poll status every 5s while step 2 is active and tab is visible
  useEffect(() => {
    if (!isPolling) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const poll = async () => {
      if (document.hidden) return; // Stop polling if tab is not visible

      try {
        const updated = await getOnboardingStatusAction();
        setStatus(updated);

        if (updated.steps.webhookVerified) {
          toast.success("Webhook verificado por Meta");
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isPolling]);

  const canProceed = (targetStep: number): boolean => {
    if (targetStep <= step) return true; // Can always go back

    // Check if all previous steps are complete
    const requiredSteps = {
      2: status.steps.credsVerified,
      3: status.steps.webhookVerified,
      4: status.steps.testMessage,
    };

    return requiredSteps[targetStep as keyof typeof requiredSteps] ?? false;
  };

  const handleStepChange = (newStep: number) => {
    if (canProceed(newStep)) {
      setStep(newStep);
    } else {
      toast.error("Completa el paso anterior primero");
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((s) => (
          <button
            key={s}
            onClick={() => handleStepChange(s)}
            disabled={step !== s && !canProceed(s)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              step === s
                ? "bg-primary text-primary-foreground"
                : canProceed(s)
                  ? "bg-muted hover:bg-muted/80 cursor-pointer"
                  : "bg-muted/40 text-muted-foreground cursor-not-allowed",
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-current/20 text-xs">
              {s}
            </span>
            Paso {s}
          </button>
        ))}
      </div>

      {/* Step 1: Credentials */}
      {step === 1 && (
        <Step1Credentials
          savedCreds={savedCreds}
          onVerified={() => {
            setStatus((s) => ({
              ...s,
              steps: { ...s.steps, creds: true, credsVerified: true },
            }));
            handleStepChange(2);
          }}
        />
      )}

      {/* Step 2: Webhook */}
      {step === 2 && (
        <Step2Webhook webhook={webhook} status={status} isPolling={isPolling} />
      )}

      {/* Step 3: Test Message */}
      {step === 3 && (
        <Step3TestMessage
          onMessageSent={() => {
            setStatus((s) => ({
              ...s,
              steps: { ...s.steps, testMessage: true },
            }));
            handleStepChange(4);
          }}
        />
      )}

      {/* Step 4: Complete */}
      {step === 4 && <Step4Complete status={status} />}

      {/* Navigation */}
      <div className="flex justify-between gap-3">
        <button
          onClick={() => handleStepChange(step - 1)}
          disabled={step === 1}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-input hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Atrás
        </button>

        {step < 4 && (
          <button
            onClick={() => handleStepChange(step + 1)}
            disabled={!canProceed(step + 1)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg",
              canProceed(step + 1)
                ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}
