import type { SafetyCaseSource } from "@prisma/client";

/**
 * What support actually does, written down.
 *
 * ## Why this is code and not an admin-editable table
 *
 * Same rule the service promises follow in `servicePolicy.ts`: prices bend,
 * claims do not. A checklist that can be edited from an admin screen is a
 * checklist that gets shortened on a busy evening, and the steps here exist
 * precisely for the evenings when there is no time. Changing one should cost a
 * review and a deploy, because changing one changes what BandhanTak promises a
 * frightened person it will do.
 *
 * ## Why the ids matter
 *
 * `SafetyCase.stepsDone` stores these ids, not the sentences. That makes "did
 * anybody actually check the other person's record" answerable across every
 * case ever worked, and it survives the wording being improved.
 *
 * ## The one rule every playbook repeats
 *
 * Support cannot read what the member wrote. `RishtaMeeting.checkpointNote` and
 * `RishtaJourney.closedReason` are private by design — that promise is the only
 * reason the checkpoint gets an honest answer at all. So step one is never
 * "read what they said"; it is "ask them whether they want to tell us".
 */

export interface PlaybookStep {
  id: string;
  title: string;
  detail: string;
}

export interface Playbook {
  source: SafetyCaseSource;
  label: string;
  /** The one-line description of what this signal actually is. */
  what: string;
  /** What support may never do on this kind of case. */
  never: string;
  steps: PlaybookStep[];
}

const REACH_OUT: PlaybookStep = {
  id: "reach-out",
  title: "Member se khud baat kijiye",
  detail:
    "Poochiye ki wo theek hain, aur kya wo iske baare me kuch batana chahenge. Unhone jo apne liye likha tha wo hum padh nahi sakte — agar wo batana chahein to unke shabd report me aayenge.",
};

const CHECK_OTHER: PlaybookStep = {
  id: "check-other",
  title: "Doosre member ka record dekhiye",
  detail:
    "Purani reports, blocks, aur kya kisi aur ne bhi inke saath aisa hi kuch mark kiya hai. Ek shikayat ittefaq ho sakti hai; teen ek pattern hai.",
};

const DECIDE: PlaybookStep = {
  id: "decide",
  title: "Faisla lijiye aur wahi kijiye",
  detail:
    "Kuch nahi / warning / account suspend / partner ko rokna. Jo bhi ho, wo /admin/users ya /admin/partners par kijiye — case sirf record rakhta hai, action wahan hota hai.",
};

const RECORD: PlaybookStep = {
  id: "record",
  title: "Kya kiya aur kyun — likh dijiye",
  detail:
    "Ek line kaafi hai, lekin honi chahiye. Agli baar isi insaan ka naam aaya to ye line hi batayegi ki pichhli baar kya hua tha.",
};

export const PLAYBOOKS: Record<SafetyCaseSource, Playbook> = {
  RISHTA_CLOSURE: {
    source: "RISHTA_CLOSURE",
    label: "Rishta band — 'kuch theek nahi laga'",
    what:
      "Member ne apna rishta band karte waqt 'kuch theek nahi laga' chuna. Ye baaki closure reasons ki tarah nahi hai — isliye ye yahan aaya, wahan nahi jahan baaki rishte jaate hain.",
    never:
      "Doosre member ko kabhi mat bataiye ki kisne kya mark kiya. Aur member ka apna closure note na maangiye na quote kijiye — wo unki apni history hai.",
    steps: [
      REACH_OUT,
      CHECK_OTHER,
      {
        id: "block-state",
        title: "Contact band hai ya nahi, confirm kijiye",
        detail:
          "Report karne par block apne aap lag jaata hai, lekin closure par nahi. Agar member chahein to block lagwaiye — unse poochh kar.",
      },
      DECIDE,
      RECORD,
    ],
  },

  MEETING_CHECKPOINT: {
    source: "MEETING_CHECKPOINT",
    label: "Mulaqat ke baad — 'kuch theek nahi laga'",
    what:
      "Ek mulaqat ke baad member ne checkpoint me 'kuch theek nahi laga' chuna. Ye sabse seedha safety signal hai jo is app me aata hai: ye do log aamne-saamne mil chuke hain.",
    never:
      "Checkpoint ka note kisi ko nahi dikhta — aapko bhi nahi. Wo promise hi wajah hai ki log is sawaal ka sach jawab dete hain. Use todiye mat.",
    steps: [
      REACH_OUT,
      {
        id: "meeting-context",
        title: "Mulaqat kaise tay hui thi, dekhiye",
        detail:
          "Rishta Room me dekhiye ki mulaqat kis ne rakhi thi — member ne khud, family ne, ya kisi partner ne. Jisne rakhi thi, uska bhi record dekhna hai.",
      },
      CHECK_OTHER,
      {
        id: "partner-involved",
        title: "Agar koi partner shaamil tha, uska record dekhiye",
        detail:
          "Meeting Coordination bik chuki ho to partner ki baaki bookings, reviews aur shikayaton par nazar daaliye. Ek partner ka naam do aise cases me aana turant rokne ki wajah hai.",
      },
      DECIDE,
      RECORD,
    ],
  },

  SERVICE_DISPUTE: {
    source: "SERVICE_DISPUTE",
    label: "Booking par shikayat",
    what:
      "Buyer ne ek paid booking par shikayat darj ki hai. Paisa abhi ruka hua hai — refund window jam chuki hai — aur jab tak koi insaan faisla nahi karta, kisi ko nahi jaata.",
    never:
      "Partner ko buyer ki niji jaankari mat dijiye, aur faisla lene se pehle paisa release mat kijiye. Jaldi ka refund bhi faisla hai — usko bhi likhna hai.",
    steps: [
      {
        id: "read-complaint",
        title: "Shikayat khud padhiye",
        detail:
          "Ye buyer ne hamein likhi hai, isliye padhi ja sakti hai — checkpoint aur closure note ke ulat. Isme jo maanga gaya hai wahi tay karta hai ki ye paisa ka jhagda hai ya safety ka.",
      },
      {
        id: "evidence",
        title: "Milestone aur proof dekhiye",
        detail:
          "Partner ne kya submit kiya, kab kiya, aur kya wo us cheez se milta hai jo bechi gayi thi. Booking par frozen deliverables hi asli waada hain.",
      },
      {
        id: "partner-side",
        title: "Partner ka paksh sunn lijiye",
        detail: "Ek taraf ki baat par paisa wapas karna bhi utna hi galat hai jitna shikayat ko andekha karna.",
      },
      {
        id: "money",
        title: "Paise ka faisla /admin/service-bookings par kijiye",
        detail:
          "Refund, aadha refund, ya partner ko release. Ledger wahi likhega jo aap chunenge — is case me sirf wajah rehti hai.",
      },
      {
        id: "pattern",
        title: "Is partner ka pattern dekhiye",
        detail:
          "Pichhli shikayatein, SLA miss aur escalation. /admin/pilot par SLA ki list hai — ek hi partner dono jagah dikhe to baat sirf is booking ki nahi hai.",
      },
      RECORD,
    ],
  },
};

export function playbookFor(source: SafetyCaseSource): Playbook {
  return PLAYBOOKS[source];
}
