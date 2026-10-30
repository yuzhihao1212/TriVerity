/**
 * One fixed plain-language line per policy rule, for the Hearing's "Rule they rely on".
 * Display text only, written from data/policies/ryde_mock_policy.json: it never changes a
 * rule or a ruling, and the full rule text stays one click away (Term). Reviewed once by the team.
 */
export const RULE_SUMMARIES: Record<string, string> = {
  "RD-1": "Route up to 15% longer than planned → normal, no refund",
  "RD-2": "Longer route that took no longer → avoiding traffic, no refund",
  "RD-3": "Long detour that also took longer → extra fare refunded",
  "RD-4": "Planned or actual distance missing → a person decides",
  "RD-5": "Detour with a stop of 10 min or more → $5.00 credit for lost time",
  "NS-1": "No-show fee only if the driver got within 100 m of pickup",
  "NS-2": "No-show fee only if the driver waited at least 5 min",
  "NS-3": "No-show fee only if the driver tried the in-app chat",
  "NS-4": "Arrival point or wait time missing → a person decides",
  "SAFE-1": "Any threatening chat message → a person decides",
  "ESC-1": "Ruling confidence below 60% → a person decides",
  "FRAUD-1": "High bad-faith risk for either side → a person decides",
  "REF-1": "A refund never exceeds the fare charged",
  "PREC-1": "Reviewers ruled differently on similar cases → a person decides",
};

export function ruleSummary(rule: string): string | undefined {
  return RULE_SUMMARIES[rule.trim().toUpperCase()];
}
