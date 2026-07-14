"use client";

import { useEffect, useRef } from "react";
import { registerCaptchaReset, setCaptchaToken } from "@/lib/data";

// Cloudflare Turnstile widget. Renders nothing until
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the app works without it.
// Tokens land in lib/data's captcha store and ride along on /api/submit.

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function Turnstile() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const el = ref.current;

    const render = () => {
      const id = window.turnstile?.render(el, {
        sitekey: SITE_KEY,
        callback: setCaptchaToken,
        "expired-callback": () => setCaptchaToken(null),
      });
      if (id !== undefined) {
        registerCaptchaReset(() => {
          try {
            window.turnstile?.reset(id);
          } catch {
            /* widget already gone */
          }
        });
      }
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`
      );
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      setCaptchaToken(null);
      registerCaptchaReset(null);
      el.innerHTML = "";
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center" />;
}
