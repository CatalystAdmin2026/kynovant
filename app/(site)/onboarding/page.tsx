import type { Metadata } from "next";
import OnboardingWizard from "@/components/OnboardingWizard";
import type { Phase } from "@/components/OnboardingWizard";
import AccessGuard from "@/components/AccessGuard";

export const metadata: Metadata = {
  title: "Onboarding | Kynovant",
  robots: { index: false, follow: false },
};

// Replace with your deployed Google Apps Script URL for standard onboarding
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzo7bkzArWJH0ev-k6l5TmPA1pGUbpjYn_US4hQj4hrVw8qLiHLUxnmH5qC7zPG9YmA/exec";

const PHASES: Phase[] = [
  // ── Phase 1: Personal Information ─────────────────────────────────────
  {
    title: "Personal Information",
    subtitle:
      "This helps us personalize communication, logistics, and your coaching profile. Every field is kept strictly confidential.",
    fields: [
      {
        id: "full_name",
        label: "Full Name",
        type: "text",
        placeholder: "Your full legal name",
        required: true,
      },
      {
        id: "dob",
        label: "Date of Birth",
        type: "date",
        required: true,
      },
      {
        id: "phone",
        label: "Phone Number",
        type: "tel",
        placeholder: "Your best contact number",
        required: true,
      },
      {
        id: "email",
        label: "Email Address",
        type: "email",
        placeholder: "Your email address",
        required: true,
      },
      {
        id: "address",
        label: "Home Address",
        type: "textarea",
        placeholder: "Street, City, State, ZIP",
        rows: 2,
      },
      {
        id: "occupation",
        label: "Current Occupation",
        type: "text",
        placeholder: "What do you do for work?",
      },
      {
        id: "emergency_contact",
        label: "Emergency Contact",
        type: "text",
        placeholder: "Full name and phone number",
      },
    ],
  },

  // ── Phase 2: Body Metrics ──────────────────────────────────────────────
  {
    title: "Body Metrics",
    subtitle:
      "Accurate starting data gives us the precision to measure real progress. Estimates are completely fine — we'll establish exact baselines together.",
    fields: [
      {
        id: "height",
        label: "Height",
        type: "text",
        placeholder: 'e.g. 5\'10"',
      },
      {
        id: "weight",
        label: "Current Weight",
        type: "text",
        placeholder: "lbs",
      },
      {
        id: "goal_weight",
        label: "Goal Weight",
        type: "text",
        placeholder: "lbs (approximate is fine)",
      },
      {
        id: "body_fat_pct",
        label: "Estimated Body Fat %",
        type: "text",
        placeholder: "If known — e.g. 22%",
        hint: "An approximate estimate is fine. We will establish a precise baseline together.",
      },
      {
        id: "measurements",
        label: "Body Measurements",
        type: "textarea",
        placeholder:
          "Chest, waist, hips, arms, thighs — if available. Leave blank if unknown.",
        rows: 3,
      },
    ],
  },

  // ── Phase 3: Goals & Vision ────────────────────────────────────────────
  {
    title: "Goals & Vision",
    subtitle:
      "Your goals determine the entire strategy. Vague goals produce average results. Be specific — this becomes the literal foundation of your performance blueprint.",
    fields: [
      {
        id: "primary_goal",
        label: "Primary Goal",
        type: "card",
        required: true,
        cardOptions: [
          {
            value: "Fat Loss",
            label: "Fat Loss",
            description: "Strip excess body fat while preserving lean muscle",
          },
          {
            value: "Muscle Growth",
            label: "Muscle Growth",
            description: "Build size, strength, and a more muscular physique",
          },
          {
            value: "Body Recomposition",
            label: "Recomposition",
            description: "Simultaneously lose fat and add lean muscle",
          },
          {
            value: "Athletic Performance",
            label: "Performance",
            description: "Improve strength, speed, power, and conditioning",
          },
          {
            value: "Lifestyle Transformation",
            label: "Lifestyle",
            description: "Build sustainable long-term health and habits",
          },
          {
            value: "Competition Prep",
            label: "Competition",
            description: "Physique or strength sport competition preparation",
          },
        ],
      },
      {
        id: "goal_timeline",
        label: "Ideal Timeline for Results",
        type: "select",
        options: [
          "3 months",
          "6 months",
          "1 year",
          "Ongoing — long-term lifestyle",
        ],
      },
      {
        id: "biggest_frustrations",
        label: "What Has Held You Back From Reaching Your Goals?",
        type: "textarea",
        placeholder:
          "Be honest — this helps us address the root cause, not just the symptoms.",
        rows: 4,
        required: true,
      },
      {
        id: "why_now",
        label: "Why Are You Starting Coaching Now?",
        type: "textarea",
        placeholder: "What changed? What's the urgency?",
        rows: 3,
      },
      {
        id: "success_vision",
        label: "What Does Success Look Like One Year From Today?",
        type: "textarea",
        placeholder:
          "Describe how you look, feel, and perform — be as specific as possible.",
        rows: 4,
        required: true,
      },
    ],
  },

  // ── Phase 4: Medical History ───────────────────────────────────────────
  {
    title: "Medical History",
    subtitle:
      "Your safety and longevity are non-negotiable. Complete honesty here allows us to build a program that works with your body — not against it.",
    fields: [
      {
        id: "medical_conditions",
        label: "Current Medical Conditions",
        type: "textarea",
        placeholder: "List any current conditions — or write 'None'",
        rows: 3,
        required: true,
      },
      {
        id: "surgeries",
        label: "Past Surgeries or Procedures",
        type: "textarea",
        placeholder: "Include approximate dates if known — or write 'None'",
        rows: 2,
      },
      {
        id: "pain_injuries",
        label: "Current Pain, Injuries, or Movement Limitations",
        type: "textarea",
        placeholder:
          "Include location, severity, and how long you've had it — or write 'None'",
        rows: 3,
      },
      {
        id: "medications",
        label: "Current Medications",
        type: "textarea",
        placeholder: "Include dosage if comfortable — or write 'None'",
        rows: 2,
      },
      {
        id: "food_allergies",
        label: "Food Allergies",
        type: "text",
        placeholder: "List any food allergies — or write 'None'",
      },
      {
        id: "dietary_restrictions",
        label: "Dietary Restrictions",
        type: "text",
        placeholder:
          "Religious, ethical, or medical restrictions — or write 'None'",
      },
    ],
  },

  // ── Phase 5: Nutrition ─────────────────────────────────────────────────
  {
    title: "Nutrition",
    subtitle:
      "We're not building another restrictive diet. We're building a nutrition strategy you can actually execute — one that fits your preferences, your lifestyle, and your goals.",
    fields: [
      {
        id: "nutrition_approach",
        label: "Preferred Nutrition Approach",
        type: "card",
        cardOptions: [
          {
            value: "Structured Meal Plan",
            label: "Structured",
            description: "I want a detailed meal plan to follow each day",
          },
          {
            value: "Macro-Based",
            label: "Macro-Based",
            description: "I prefer hitting daily macro and calorie targets",
          },
          {
            value: "Flexible Tracking",
            label: "Flexible",
            description: "I want flexibility within a defined framework",
          },
          {
            value: "Habit-Based",
            label: "Habit-Based",
            description: "I prefer behavioral habits over tracking numbers",
          },
          {
            value: "Not Sure Yet",
            label: "Not Sure",
            description: "Guide me to what will work best for my lifestyle",
          },
        ],
      },
      {
        id: "meals_per_day",
        label: "How Many Meals Do You Typically Eat Per Day?",
        type: "select",
        options: ["1–2", "3", "4", "5+", "Varies significantly"],
      },
      {
        id: "calorie_tracking",
        label: "Do You Currently Track Calories or Macros?",
        type: "select",
        options: [
          "Yes — consistently",
          "Occasionally",
          "No — but I understand the basics",
          "No — never tracked",
        ],
      },
      {
        id: "restaurant_frequency",
        label: "How Often Do You Eat at Restaurants Per Week?",
        type: "select",
        options: [
          "Rarely (0–1×)",
          "Sometimes (2–3×)",
          "Often (4–5×)",
          "Daily or more",
        ],
      },
      {
        id: "favorite_foods",
        label: "Favorite Foods and Meals",
        type: "textarea",
        placeholder: "Help us build a plan you will actually enjoy following.",
        rows: 3,
      },
      {
        id: "foods_to_avoid",
        label: "Foods You Dislike or Need to Avoid",
        type: "textarea",
        placeholder:
          "Beyond restrictions listed earlier — personal preferences count.",
        rows: 2,
      },
      {
        id: "cooking_level",
        label: "Cooking Skill Level",
        type: "select",
        options: [
          "Beginner — simple meals only",
          "Intermediate — comfortable in the kitchen",
          "Advanced — comfortable with complex meals",
          "Rarely cook",
        ],
      },
      {
        id: "water_intake",
        label: "Daily Water Intake",
        type: "select",
        options: [
          "Less than 64 oz",
          "64–96 oz",
          "96–128 oz",
          "128 oz or more",
        ],
      },
      {
        id: "alcohol_use",
        label: "Alcohol Consumption",
        type: "select",
        options: [
          "None",
          "Occasional (1–2 drinks/week)",
          "Moderate (3–7 drinks/week)",
          "Frequent (7+ drinks/week)",
        ],
      },
      {
        id: "current_supplements",
        label: "Current Supplements",
        type: "textarea",
        placeholder: "List all — or write 'None'",
        rows: 2,
      },
    ],
  },

  // ── Phase 6: Training ──────────────────────────────────────────────────
  {
    title: "Training",
    subtitle:
      "Your training history tells us what your body has already adapted to, what's working, and what we need to rebuild. This shapes the architecture of your program.",
    fields: [
      {
        id: "years_training",
        label: "Training Experience Level",
        type: "card",
        cardOptions: [
          {
            value: "Beginner",
            label: "Beginner",
            description: "Under 1 year of consistent training",
          },
          {
            value: "Intermediate",
            label: "Intermediate",
            description: "1–3 years of consistent, structured training",
          },
          {
            value: "Advanced",
            label: "Advanced",
            description: "3–10 years of serious, progressive training",
          },
          {
            value: "Competitive Athlete",
            label: "Competitive",
            description: "10+ years or active sport/competition background",
          },
        ],
      },
      {
        id: "current_program",
        label: "Current Training Split / Schedule",
        type: "textarea",
        placeholder:
          "Describe your current weekly training structure — or write 'None' if not currently training.",
        rows: 3,
      },
      {
        id: "favorite_exercises",
        label: "Favorite Exercises or Movements",
        type: "textarea",
        placeholder: "What do you enjoy? What do you naturally gravitate toward?",
        rows: 2,
      },
      {
        id: "equipment_access",
        label: "Primary Training Environment",
        type: "select",
        options: [
          "Commercial gym — full equipment",
          "Home gym — limited equipment",
          "Minimal equipment / bodyweight",
          "Mixed / varies",
        ],
      },
      {
        id: "cardio_routine",
        label: "Current Cardio Routine",
        type: "textarea",
        placeholder: "Type, frequency, and duration — or write 'None'",
        rows: 2,
      },
      {
        id: "recovery_methods",
        label: "Current Recovery Methods",
        type: "textarea",
        placeholder:
          "Stretching, massage, sauna, cold plunge, etc. — or write 'None'",
        rows: 2,
      },
      {
        id: "sleep_hours",
        label: "Average Nightly Sleep",
        type: "select",
        options: [
          "Less than 5 hours",
          "5–6 hours",
          "6–7 hours",
          "7–8 hours",
          "8+ hours",
        ],
      },
      {
        id: "stress_level",
        label: "Current Overall Stress Level",
        type: "select",
        options: ["Very low", "Low", "Moderate", "High", "Very high"],
      },
    ],
  },

  // ── Phase 7: Lifestyle ─────────────────────────────────────────────────
  {
    title: "Lifestyle",
    subtitle:
      "A program that ignores how you actually live will never stick. Your lifestyle determines how the coaching system needs to be built — to integrate, not compete.",
    fields: [
      {
        id: "work_schedule",
        label: "Typical Work Schedule",
        type: "select",
        options: [
          "Standard (9–5, Mon–Fri)",
          "Shift work / rotating schedule",
          "Remote / flexible hours",
          "Entrepreneur / highly variable",
          "Stay-at-home",
        ],
      },
      {
        id: "has_children",
        label: "Do You Have Children?",
        type: "select",
        options: [
          "No",
          "Yes — young children (under 5)",
          "Yes — school-age children",
          "Yes — older children",
        ],
      },
      {
        id: "lifestyle_travel",
        label: "How Often Does Your Life Involve Travel?",
        type: "select",
        options: [
          "Rarely",
          "Monthly",
          "2–3 times per month",
          "Weekly or more",
        ],
      },
      {
        id: "home_support",
        label: "Home Support for Your Fitness Goals",
        type: "select",
        options: [
          "Strong support — household is on board",
          "Moderate support",
          "Minimal support",
          "No support — I'm doing this independently",
        ],
      },
      {
        id: "motivation",
        label: "What Motivates You to Pursue This Goal?",
        type: "textarea",
        placeholder:
          "The deeper the reason, the stronger the foundation. Go beyond surface-level answers.",
        rows: 3,
      },
      {
        id: "biggest_obstacles",
        label: "What Has Been Your Biggest Obstacle to Consistency?",
        type: "textarea",
        placeholder:
          "Time, energy, knowledge, environment, accountability — be honest.",
        rows: 3,
      },
    ],
  },

  // ── Phase 8: Progress Photos ───────────────────────────────────────────
  {
    title: "Progress Photos",
    subtitle:
      "Visual documentation gives us an objective baseline that numbers alone can't capture. Photos tell the story of your transformation — before, during, and after.",
    fields: [
      {
        id: "photos_info",
        label: "",
        type: "info",
        content:
          "Please email your progress photos to catalyst.coaching.headcoach@gmail.com with your full name in the subject line. Include three photos: front (relaxed), side (relaxed), and back (relaxed). Wear form-fitting clothing or athletic wear. Photos are kept strictly confidential and are never shared. You have 48 hours from submitting this form to send them.",
      },
      {
        id: "photo_consent",
        label:
          "I understand that photos should be emailed to catalyst.coaching.headcoach@gmail.com within 48 hours of submitting this form.",
        type: "checkbox",
        required: true,
      },
    ],
  },

  // ── Phase 9: Agreement & Signature ────────────────────────────────────
  {
    title: "Agreement",
    subtitle:
      "The final step. Review, agree, and sign to authorize your performance blueprint build. We begin immediately after submission.",
    fields: [
      {
        id: "agree_timeline",
        label:
          "I understand that my custom coaching program requires 3–5 business days to build after this form is submitted.",
        type: "checkbox",
        required: true,
      },
      {
        id: "agree_accurate",
        label:
          "I certify that all information provided in this questionnaire is accurate and complete to the best of my knowledge.",
        type: "checkbox",
        required: true,
      },
      {
        id: "agree_terms",
        label:
          "I agree to the Kynovant terms and conditions and understand that my coaching subscription is active.",
        type: "checkbox",
        required: true,
      },
      {
        id: "esignature",
        label: "Electronic Signature",
        type: "signature",
        placeholder: "Type your full legal name",
        required: true,
      },
      {
        id: "signature_date",
        label: "Today's Date",
        type: "date",
        required: true,
      },
    ],
  },
];

export default function OnboardingPage() {
  return (
    <AccessGuard
      sessionKey="catalyst_standard_paid_access"
      progressKey="catalyst_onboarding_progress"
      redirectTo="/payment-confirmed"
    >
      <OnboardingWizard
      phases={PHASES}
      heading="Kynovant"
      headingLine2="Coaching"
      welcomeSubheading="We're about to build your Performance Blueprint."
      welcomeBody="This assessment takes approximately 12–15 minutes. Every answer helps us personalize your training, nutrition, habits, recovery, and coaching strategy."
      welcomeChecklist={[
        "Custom Training Program",
        "Precision Nutrition Strategy",
        "Habit Blueprint",
        "Recovery Guidance",
        "Weekly Coaching System",
        "Delivered within 3–5 business days",
      ]}
      totalMinutes={15}
      scriptUrl={SCRIPT_URL}
      storageKey="catalyst_onboarding_progress"
      formType="standard_onboarding"
      packageType="standard"
    />
    </AccessGuard>
  );
}
