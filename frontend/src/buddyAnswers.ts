// The owl's questions on an open case. Every answer comes from what the rules and records already
// say, so it costs nothing, works with AI Off and can't invent a fact. Nothing here recommends an
// outcome: the reviewer decides. Pure.

import { ruleSummary } from "./ruleSummaries";
import { refundSum, rulingBrief, rulingSides } from "./verdictDisplay";
import type { DisputeCase, Resolution } from "./types";

export type BuddyStage = "open" | "held" | "closed";

export interface BuddyAnswer {
  id: "why" | "missing" | "rule" | "change" | "sides" | "after";
  question: string;
  lead: string;
  points: string[];
  note?: string;
  rules: string[];
  facts: string[];
  step?: "hearing";
}

const unique = (items: string[]) => [...new Set(items)];
const ruleText = (rule: string) => ruleSummary(rule)?.replace(" → ", ": ") ?? null;

/** What a reviewer asks when lost, most useful first for the step they're on. */
export function buddyAnswers({ resolution, dispute, stage, tab }: {
  resolution: Resolution; dispute: Pick<DisputeCase, "rider_claim" | "driver_statement" | "fare">; stage: BuddyStage; tab: string;
}): BuddyAnswer[] {
  const brief = rulingBrief(resolution);
  const review = resolution.decision === "needs_review";
  const checks = resolution.conditions ?? [];
  const factsOf = (rules: string[]) => unique(checks.filter(check => rules.includes(check.rule)).flatMap(check => check.fact_ids));

  const whyRules = (review ? brief.triggers : brief.known).map(check => check.rule);
  const why: BuddyAnswer = {
    id: "why",
    question: !review ? "Why did the rules decide this?" : stage === "closed" ? "Why did it need a person?" : "Why is this case with me?",
    lead: brief.reason,
    points: brief.riskReasons.length ? brief.riskReasons : (review ? brief.triggers : brief.known).map(check => `${check.label}: ${check.value}`),
    note: brief.riskReasons.length ? "A signal isn't proof. It's a reason to look closer." : undefined,
    rules: whyRules,
    facts: factsOf(whyRules),
  };

  const dataRules = checks.filter(check => /-4$/.test(check.rule)).map(check => check.rule);
  const missing: BuddyAnswer = {
    id: "missing",
    question: "What's missing?",
    lead: brief.missing ? `${brief.missing.fact}.` : "Nothing the rules need is missing.",
    points: brief.missing?.changeLine ? [brief.missing.changeLine] : [],
    rules: dataRules,
    facts: factsOf(dataRules),
  };

  const main = brief.known[0];
  const sum = refundSum(resolution, dispute.fare);
  const rule: BuddyAnswer = {
    id: "rule",
    question: "Which rule matters most here?",
    lead: main ? `${main.rule}: ${ruleText(main.rule) ?? main.label}` : brief.reason,
    points: [
      ...(main ? [`On this case: ${main.value}`] : []),
      ...(brief.proposed ? [`The rules propose: ${brief.proposed}.`] : []),
      ...(sum ? [sum.text] : []),
    ],
    rules: main ? [main.rule] : [],
    facts: main ? factsOf([main.rule]) : [],
  };

  const changes = (resolution.counterfactuals ?? []).slice(0, 2);
  const changeRules = unique(changes.flatMap(item => item.rules));
  const lines = changes.map(item => `If ${item.change}, the outcome would be ${item.outcome}.`);
  const change: BuddyAnswer = {
    id: "change",
    question: "What would change the outcome?",
    lead: lines[0] ?? "No other outcome is recorded for this case.",
    points: lines.slice(1),
    rules: changeRules,
    facts: [],
  };

  const asks = rulingSides(resolution);
  const sides: BuddyAnswer = {
    id: "sides",
    question: "What does each side say?",
    lead: "These are their positions, not verified facts.",
    points: [
      `Rider: ${asks?.rider ?? dispute.rider_claim}`,
      `Driver: ${asks?.driver ?? dispute.driver_statement ?? "No statement recorded."}`,
    ],
    rules: [],
    facts: [],
    step: "hearing",
  };

  const next = {
    open: {
      question: "What happens after I decide?",
      lead: "You review both messages before anything is sent.",
      points: [
        "Your decision is saved as a precedent for similar disputes.",
        "The rider and driver can appeal after delivery.",
        "An investigation, or a refund above your limit, puts the case on hold and nobody is notified.",
      ],
    },
    held: { question: "What happens now?", lead: "This case is on hold, and nobody has been notified.", points: [] },
    closed: {
      question: "What happens now?",
      lead: "This case is closed, and both parties have been told.",
      points: ["They can appeal.", "You can reopen the case to send a correction. The history keeps every message."],
    },
  }[stage];
  const after: BuddyAnswer = { ...next, id: "after", rules: [], facts: [] };

  return tab === "hearing" ? [sides, why, rule, missing, change, after]
    : tab === "notify" ? [after, why, rule, missing, change, sides]
    : brief.missing ? [missing, why, rule, change, sides, after]
    : [why, missing, rule, change, sides, after];
}
