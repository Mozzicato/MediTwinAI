# Demo video script (≤ 3 minutes)

Recording setup: 1440×900 browser, `GROQ_API_KEY` set so the AI-written explanation is on screen (Groq's free tier rate-limits bursts; MediTwin then shows the reviewed template), and the twin warmed up once (open David before recording so the HOLON cache is hot). Use the **guided demo**: each "Next" performs the step for you.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Landing | "Most people meet their health data in pieces: a lab result, a symptom, a code like LOINC 4548-4. MediTwin turns an OntoMorph digital twin into something you can understand, without ever diagnosing you." |
| 0:15 | Click **Explore Demo Twin**, show the twin list | "These are live OntoMorph sandbox twins. We'll follow David." Click **Start guided demo**. |
| 0:25 | Step 1: Overview | "David's twin was just pulled from the DTP: 11 events, including labs, a glucose monitor and medications." |
| 0:40 | Step 2: Metabolic system | "His HbA1c is 7.1%. HOLON says the reference is 4.0 to 5.6, so it's above range, and trending down from 8.2. The pancreas, liver and kidneys light up. Those are FMA anatomy concepts HOLON verified, not guesses." |
| 1:00 | Step 3: HOLON drawer | "Here's how the raw record was resolved: LOINC code, HOLON concept, the range and who published it. The codes stay behind the scenes." |
| 1:15 | Step 4: Symptom check | "No chat box. David picks increased thirst, frequent urination and fatigue. They become SNOMED CT and HPO concepts." Optionally type a sentence into *describe it in your own words*. |
| 1:30 | Step 5: Health context | "MediTwin combines the twin data with the new symptoms using a named rule. It's an attention signal, and HOLON's phenotype match notices the same symptoms were already recorded two weeks ago." |
| 1:50 | Step 6: Anatomy | "Why this area? Tap the pancreas: it makes insulin." |
| 2:05 | Step 7: Explanation | "Every sentence cites its evidence. A safety layer blocks diagnoses and medication advice, and the care guidance comes from reviewed content. This isn't a diagnosis: it's context, and a clear next step." |
| 2:25 | **What-if** | "Using OntoMorph's simulation on David's own baseline, lifestyle changes project HbA1c from 7.1 to 6.6. We only offer scenarios that don't touch medication." |
| 2:40 | **Save to twin**, then **Integration trace** | "The signal is written back to the twin for his care team, and here is every DTP, HOLON and AI call with its latency." |
| 2:50 | Grace, chest pain + breathlessness (optional, if time) | "And when symptoms are dangerous, the AI steps aside: straight to emergency guidance." |
| 3:00 | End | "MediTwin: understand your health, see your body differently." |

Tip: record Grace's urgent path as a 5-second cutaway rather than live, to stay under three minutes.
