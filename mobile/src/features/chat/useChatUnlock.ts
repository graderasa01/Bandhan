import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "~/components";
import { qk, useChatUnlockQuote } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import { chatService } from "~/services/chat";
import { checkoutHandoffUrl, openInBrowserUntilBack, trustedCheckoutPath } from "~/services/webCheckout";

/**
 * - `idle`      the Unlock button
 * - `starting`  asking the server to open the chat or create its checkout — busy, further taps ignored
 * - `browser`   the checkout is open in the browser; waiting for the member to come back
 * - `checking`  re-reading the thread and the chat list from the server
 * - `pending`   back from the browser, but the server has not opened the chat — never assumed paid
 */
export type ChatUnlockPhase = "idle" | "starting" | "browser" | "checking" | "pending";

const OPENED = "Chat khul gayi — ab aap dono baat kar sakte hain.";

/**
 * Opening one locked chat from the app, the way the web's `ChatUnlockCard`
 * does and through the same endpoint (`POST /api/chat-unlock/:matchId`): the
 * chat may already be open, a held free unlock may open it, or it costs money
 * and the server hands back a checkout.
 *
 * A checkout is paid in the browser (`services/webCheckout.ts`), and coming
 * back from it proves nothing — the chat is open only when the server says so,
 * which it does once the payment webhook (or the checkout's server-side
 * confirm) has seen the capture. So after the browser, this only re-asks.
 */
export function useChatUnlock(matchId: string) {
  const qc = useQueryClient();
  const quote = useChatUnlockQuote(matchId, true);
  const [phase, setPhase] = useState<ChatUnlockPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // `phase` drives the UI; this is what stops a second tap that lands before
  // the re-render — one checkout request at a time.
  const inFlight = useRef(false);
  const releaseBrowser = useRef<(() => void) | null>(null);

  /** Fresh thread + chat list from the server; true only when it now says this chat is open. */
  async function refreshOpen(): Promise<boolean> {
    const [list] = await Promise.all([
      qc.fetchQuery({ queryKey: qk.conversations, queryFn: chatService.conversations, staleTime: 0 }),
      qc.invalidateQueries({ queryKey: qk.thread(matchId) }),
    ]);
    void qc.invalidateQueries({ queryKey: qk.chatUnlock(matchId) });
    return list.find((c) => c.matchId === matchId)?.chatOpen === true;
  }

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase("starting");
    const quoted = quote.data?.state;
    try {
      const outcome = await chatService.unlock(matchId);

      if (outcome.state === "open") {
        // Already open, or a held credit just opened it — the server's answer either way.
        setPhase("checking");
        await refreshOpen();
        if (quoted === "credit") toast.success("Free unlock se chat khul gayi — ab aap dono baat kar sakte hain.");
        else if (quoted === "open") toast.info("Ye chat pehle se khuli hai.");
        else toast.success(OPENED);
        setPhase("idle");
        return;
      }

      const path = trustedCheckoutPath(outcome.checkoutUrl);
      if (!path) throw new Error("Payment page ka link sahi nahi laga, isliye khola nahi — dobara try karein.");
      const url = await checkoutHandoffUrl(path);

      setPhase("browser");
      const manualReturn = new Promise<void>((resolve) => {
        releaseBrowser.current = resolve;
      });
      try {
        await openInBrowserUntilBack(url, manualReturn);
      } finally {
        releaseBrowser.current = null;
      }

      setPhase("checking");
      if (await refreshOpen()) {
        toast.success(OPENED);
        setPhase("idle");
      } else {
        setPhase("pending");
      }
    } catch (err) {
      setError(errorMessage(err));
      // A failure after the browser may still follow a real payment, so it
      // keeps the "don't pay twice" state rather than offering a fresh start.
      setPhase((p) => (p === "checking" ? "pending" : "idle"));
    } finally {
      inFlight.current = false;
    }
  }

  /** "I'm back" — for when returning never changed the foreground (split screen, a blocked pop-up). */
  function returnedFromBrowser() {
    releaseBrowser.current?.();
  }

  async function checkAgain() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase("checking");
    try {
      if (await refreshOpen()) {
        toast.success(OPENED);
        setPhase("idle");
      } else {
        setPhase("pending");
      }
    } catch (err) {
      setError(errorMessage(err));
      setPhase("pending");
    } finally {
      inFlight.current = false;
    }
  }

  return { quote: quote.data, phase, error, start, checkAgain, returnedFromBrowser };
}
