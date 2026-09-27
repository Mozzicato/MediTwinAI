// Medical safety layer (FR-016). Every explanation passes through here before a user sees it,
// whether the AI wrote it or it came from a reviewed template. A single violation rejects the text.

export interface SafetyRule {
  id: string;
  description: string;
  pattern: RegExp;
}

const MEDICINES = "medications?|medicines?|meds|doses?|dosage|pills?|tablets?|insulin|metformin|statins?|atorvastatin|amlodipine|tamoxifen|albuterol|inhalers?|drugs?|treatment";

export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "NO_DEFINITIVE_DIAGNOSIS",
    description: "States that the user has a condition",
    pattern: /\byou(?:'ve| have| definitely have| certainly have| probably have| likely have| clearly have)\s+(?!(?:been|reported|recorded|mentioned|noted|selected|described|shared|told|had a|a (?:result|reading|measurement|record))\b)(?:got\s+)?(?:an?\s+|type [12]\s+)?(?:diabetes|cancer|hypertension|asthma|infection|disease|disorder|syndrome|condition|tumou?r|heart failure|kidney failure|pre-?diabetes|illness)\b/i,
  },
  {
    id: "NO_DIAGNOSTIC_CERTAINTY",
    description: "Presents a finding as certain or confirmed",
    pattern: /\b(?:this|these|it|that|the|your)(?:\s+(?:results?|symptoms?|readings?|numbers?|findings?|scans?|tests?|measurements?))?\s+(?:definitely|certainly|clearly|confirms?|proves?|means you have|shows? you have|indicates? you have)\b/i,
  },
  {
    id: "NO_FALSE_REASSURANCE",
    description: "Dismisses the need for care or says nothing is wrong",
    pattern: /\b(?:nothing (?:serious|to worry about|(?:is )?wrong)|you(?:'re| are) (?:perfectly |completely )?(?:healthy|fine|okay)|(?:you )?(?:do not|don't|dont) (?:need|have) to (?:see|visit|consult|talk to|worry)|no need to (?:see|visit|consult|worry|seek)|not (?:anything )?serious|no (?:current |clear )?(?:laboratory |lab |clinical )?(?:indication|sign|signs|evidence) of (?:an? )?(?:abnormality|problem|disease|concern|issue|illness)|(?:results?|readings?|measurements?|tests?) (?:are|is|look|looks|seem|seems) (?:normal|fine|healthy|reassuring))\b/i,
  },
  {
    id: "NO_MEDICATION_DIRECTIVE",
    description: "Tells the user to start, stop or change a medicine",
    pattern: new RegExp(`\\b(?:take|start|stop|quit|increase|decrease|double|halve|skip|reduce|discontinue|continue|change|adjust|switch)(?:ing)?\\b[^.!?]{0,40}\\b(?:${MEDICINES})\\b`, "i"),
  },
  {
    id: "NO_REPLACING_CLINICIAN",
    description: "Implies MediTwin replaces a clinician",
    pattern: /\b(?:instead of (?:seeing|visiting) a (?:doctor|clinician)|(?:I|MediTwin) (?:can )?diagnos(?:e|ed))\b/i,
  },
  {
    id: "NO_CURE_CLAIMS",
    description: "Promises cures or guaranteed outcomes",
    pattern: /\b(?:cure[sd]?|guarantee[sd]?|will (?:definitely|certainly) (?:improve|go away|resolve))\b/i,
  },
];

export interface SafetyResult {
  passed: boolean;
  violations: { ruleId: string; excerpt: string }[];
}

export function checkSafety(texts: string[]): SafetyResult {
  const violations: SafetyResult["violations"] = [];
  for (const text of texts) {
    for (const rule of SAFETY_RULES) {
      const match = text.match(rule.pattern);
      if (match) violations.push({ ruleId: rule.id, excerpt: match[0] });
    }
  }
  return { passed: violations.length === 0, violations };
}

export const SAFETY_CHECK_IDS = SAFETY_RULES.map((rule) => rule.id);
