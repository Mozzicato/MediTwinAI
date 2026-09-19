import unittest

from app.main import ExplanationInput, GLUCOSE_EVENT, SignalAnalysisInput, SymptomInput, analyze_signal, create_explanation, get_anatomy, get_signals


class SignalTests(unittest.TestCase):
    def test_glucose_above_reference_generates_attention_signal(self):
        self.assertGreater(GLUCOSE_EVENT["value"], GLUCOSE_EVENT["reference"]["upper"])
        signal = analyze_signal(SymptomInput(names=["Increased thirst"], duration="2 weeks", severity="moderate"))
        self.assertEqual(signal["type"], "ATTENTION")
        self.assertIn("fasting_glucose_above_reference", signal["evidence"])

    def test_irrelevant_symptom_does_not_create_attention_signal(self):
        signal = analyze_signal(SignalAnalysisInput(names=["Headache"], duration="2 weeks", severity="mild"))
        self.assertEqual(signal["type"], "INFORMATION")

    def test_no_symptoms_produces_information_signal(self):
        signal = analyze_signal(SignalAnalysisInput(names=[], duration="2 weeks", severity="mild"))
        self.assertEqual(signal["type"], "INFORMATION")

    def test_explanation_discloses_that_it_is_not_a_diagnosis(self):
        explanation = create_explanation(
            ExplanationInput(event_id=GLUCOSE_EVENT["id"], symptom_names=["Increased thirst"])
        )
        self.assertIn("does not establish a diagnosis", explanation["text"])
        self.assertIn("not medical advice", explanation["disclaimer"])

    def test_measurement_only_explanation_does_not_claim_symptoms_were_reported(self):
        explanation = create_explanation(ExplanationInput(event_id=GLUCOSE_EVENT["id"], symptom_names=[]))
        self.assertIn("single result", explanation["text"])
        self.assertNotIn("symptoms you reported", explanation["text"])
        self.assertIn("does not establish a diagnosis", explanation["text"])

    def test_anatomy_is_explicitly_unavailable_without_a_verified_integration(self):
        anatomy = get_anatomy("metabolic")
        self.assertFalse(anatomy["available"])
        self.assertIn("No OntoMorph anatomy visualization", anatomy["message"])

    def test_demo_signal_endpoint_returns_structured_attention_signal(self):
        signal = get_signals()[0]
        self.assertEqual(signal["type"], "ATTENTION")
        self.assertEqual(signal["system"], "Metabolic")