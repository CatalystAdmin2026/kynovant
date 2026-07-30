import type { Metadata } from "next";
import OnboardingWizard from "@/components/OnboardingWizard";
import type { Phase } from "@/components/OnboardingWizard";
import AccessGuard from "@/components/AccessGuard";

export const metadata: Metadata = {
  title: "Executive Performance Onboarding | Kynovant",
  robots: { index: false, follow: false },
};

// Replace with your deployed Google Apps Script URL for executive onboarding
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzo7bkzArWJH0ev-k6l5TmPA1pGUbpjYn_US4hQj4hrVw8qLiHLUxnmH5qC7zPG9YmA/exec";

const PHASES: Phase[] = [
  // ── Phase 1: Personal Information ─────────────────────────────────────
  {
    title: "Personal Information",
    subtitle:
      "Your Executive Performance file begins here. This information personalizes your coaching profile and ensures seamless communication throughout your engagement. All data is strictly confidential.",
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
        placeholder: "Your best direct contact number",
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
        label: "Primary Residence Address",
        type: "textarea",
        placeholder: "Street, City, State, ZIP",
        rows: 2,
      },
      {
        id: "occupation",
        label: "Current Role / Title",
        type: "text",
        placeholder: "Title and industry",
      },
      {
        id: "time_zone",
        label: "Primary Time Zone",
        type: "text",
        placeholder: "e.g. Eastern, Pacific, GMT+2",
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
      "Your InBody H30 will establish a clinical-grade body composition baseline. This section captures your current self-assessment so we can begin structuring your blueprint before your device arrives.",
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
        placeholder: "If known — e.g. 18%",
        hint: "Approximate is fine. Your InBody H30 assessment will establish a precise, clinically accurate baseline.",
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
      "Your goals dictate every strategic decision in your blueprint. The more precise your answer here, the more precisely your program can be engineered. Think beyond aesthetics — think performance, longevity, and identity.",
    fields: [
      {
        id: "primary_goal",
        label: "Primary Goal",
        type: "card",
        required: true,
        cardOptions: [
          {
            value: "Fat Loss & Composition",
            label: "Fat Loss",
            description: "Strip excess body fat while preserving lean muscle",
          },
          {
            value: "Muscle Growth",
            label: "Muscle Growth",
            description: "Build size, strength, and a more powerful physique",
          },
          {
            value: "Body Recomposition",
            label: "Recomposition",
            description: "Simultaneously lose fat and add lean muscle tissue",
          },
          {
            value: "Executive Performance",
            label: "Performance",
            description: "Optimize energy, focus, resilience, and longevity",
          },
          {
            value: "Lifestyle Optimization",
            label: "Lifestyle",
            description: "Build sustainable elite health habits for life",
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
          "Be direct — we need to understand the root cause, not the surface symptom.",
        rows: 4,
        required: true,
      },
      {
        id: "why_now",
        label: "Why Are You Starting Executive Performance Now?",
        type: "textarea",
        placeholder: "What changed? What is the urgency or inflection point?",
        rows: 3,
      },
      {
        id: "success_vision",
        label: "What Does Success Look Like One Year From Today?",
        type: "textarea",
        placeholder:
          "Describe how you look, how you perform professionally, how you feel — be specific about how health impacts your leadership and life.",
        rows: 4,
        required: true,
      },
    ],
  },

  // ── Phase 4: Medical History ───────────────────────────────────────────
  {
    title: "Medical History",
    subtitle:
      "Your safety and longevity are non-negotiable. Complete honesty here protects you and allows us to build a program that works with your physiology — not against it.",
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
          "Include location, severity, and duration — or write 'None'",
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
      "We're building a precision nutrition strategy — not a restrictive diet. Every decision accounts for your travel schedule, restaurant frequency, and the reality of an executive lifestyle.",
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
            description: "I want flexibility within a precise framework",
          },
          {
            value: "Habit-Based",
            label: "Habit-Based",
            description: "I prefer behavioral habits over tracking numbers",
          },
          {
            value: "Not Sure Yet",
            label: "Guide Me",
            description: "Advise me on what will work best for my lifestyle",
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
        id: "restaurant_preferences",
        label: "Restaurant Dining Priorities When Traveling",
        type: "textarea",
        placeholder:
          "Cuisine types you prefer, how you typically navigate business dinners, what makes a restaurant meal work within your goals",
        rows: 3,
      },
      {
        id: "favorite_foods",
        label: "Favorite Foods and Meals",
        type: "textarea",
        placeholder: "Help us build a plan you will genuinely want to follow.",
        rows: 3,
      },
      {
        id: "foods_to_avoid",
        label: "Foods You Dislike or Need to Avoid",
        type: "textarea",
        placeholder: "Beyond restrictions — preferences and aversions count.",
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
      "Your training history tells us what your body has adapted to, what works, and where we need to build from. This determines the architecture and loading strategy of your program.",
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
        placeholder: "What do you naturally gravitate toward?",
        rows: 2,
      },
      {
        id: "equipment_access",
        label: "Primary Training Environment",
        type: "select",
        options: [
          "Commercial gym — full equipment",
          "Private / hotel gym",
          "Home gym — limited equipment",
          "Mixed / varies by travel",
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
        label: "Current Recovery Methods & Equipment",
        type: "textarea",
        placeholder:
          "Sauna, cold plunge, massage, compression, wearables (Whoop, Oura, Garmin), etc. — or write 'None'",
        rows: 3,
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
      "A blueprint that ignores how you actually live will never hold. Your schedule, travel patterns, and environment determine how we must architect your coaching system to integrate — not compete — with your life.",
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
          "C-suite / executive — irregular hours",
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
        id: "household_support",
        label: "Household / Assistant Support",
        type: "textarea",
        placeholder:
          "Do you have a personal assistant, household manager, private chef, or similar support? Describe how meals and scheduling are currently handled.",
        rows: 2,
      },
      {
        id: "lifestyle_travel",
        label: "Business Travel Frequency",
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
          "The deeper the reason, the stronger the foundation. Go beyond surface-level answers — what does this really mean to you?",
        rows: 3,
      },
      {
        id: "biggest_obstacles",
        label: "What Has Been Your Biggest Obstacle to Consistency?",
        type: "textarea",
        placeholder:
          "Time, energy, travel, accountability, environment — be specific.",
        rows: 3,
      },
    ],
  },

  // ── Phase 8: Progress Photos ───────────────────────────────────────────
  {
    title: "Progress Photos",
    subtitle:
      "Visual documentation establishes an objective, undeniable baseline. These photos belong in your performance file — they are your before, so you can see and own your after.",
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
      "The foundation is set. Review, agree, and sign to authorize the build of your Executive Performance blueprint. Your coaching system begins immediately after submission.",
    fields: [
      {
        id: "agree_timeline",
        label:
          "I understand that my custom Executive Performance program requires 3–5 business days to build after this form is submitted.",
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
          "I agree to the Kynovant terms and conditions and understand that my Executive Performance subscription is active.",
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

  // ── Phase 10: Bloodwork & Health Optimization ──────────────────────────
  {
    title: "Bloodwork & Biomarkers",
    subtitle:
      "Your InBody H30 measures body composition with precision. This section aligns your program with your internal health markers, hormonal profile, and optimization targets — building an operating system for your physiology.",
    fields: [
      {
        id: "last_bloodwork",
        label: "Last Comprehensive Bloodwork Panel",
        type: "card",
        cardOptions: [
          {
            value: "Within 3 months",
            label: "Recent",
            description: "Within the last 3 months",
          },
          {
            value: "3–6 months ago",
            label: "6 Months",
            description: "3–6 months ago",
          },
          {
            value: "6–12 months ago",
            label: "Last Year",
            description: "6–12 months ago",
          },
          {
            value: "Over 1 year ago",
            label: "Overdue",
            description: "More than 1 year ago",
          },
          {
            value: "Never",
            label: "Never",
            description: "I've never had comprehensive bloodwork",
          },
        ],
      },
      {
        id: "known_deficiencies",
        label: "Known Deficiencies or Hormonal Imbalances",
        type: "textarea",
        placeholder:
          "Vitamin D, testosterone, thyroid, cortisol, iron, B12, etc. — or write 'None known'",
        rows: 3,
      },
      {
        id: "hormone_protocol",
        label: "Are You Currently Using Any Hormone Optimization Protocol?",
        type: "select",
        options: [
          "Yes — TRT / HRT",
          "Yes — other protocol (describe below)",
          "No — but I'm interested in exploring options",
          "No",
        ],
      },
      {
        id: "hormone_protocol_details",
        label: "Protocol Details",
        type: "textarea",
        placeholder:
          "If yes above — describe the protocol, dosage, and duration. Otherwise leave blank.",
        rows: 2,
      },
      {
        id: "health_optimization_goals",
        label: "Health Optimization Priorities",
        type: "textarea",
        placeholder:
          "Energy, cognitive sharpness, longevity, libido, inflammation reduction, sleep quality, cardiovascular performance — be specific about what matters most.",
        rows: 3,
      },
      {
        id: "supplement_history",
        label: "Full Supplement History",
        type: "textarea",
        placeholder:
          "What have you tried? What worked? What didn't? Include past stacks and protocols — or write 'None'",
        rows: 4,
      },
    ],
  },

  // ── Phase 11: Executive Performance Profile ────────────────────────────
  {
    title: "Executive Profile",
    subtitle:
      "Your professional life is not separate from your performance system — it is part of it. We engineer around your schedule, your demands, and your standards. Not despite them.",
    fields: [
      {
        id: "performance_priorities",
        label: "Top 3 Executive Performance Priorities",
        type: "textarea",
        placeholder:
          "e.g. Sustained energy through 2pm meetings, stress resilience under pressure, sharper focus, physique for leadership presence, long-term longevity",
        rows: 3,
        required: true,
      },
      {
        id: "performance_gaps",
        label: "Where Is Your Health Most Limiting Your Professional Performance?",
        type: "textarea",
        placeholder:
          "Be specific and direct — where do you feel the gap between who you are and who you need to be?",
        rows: 3,
      },
      {
        id: "peak_performance_times",
        label: "When Are You Most Productive and Energetic?",
        type: "textarea",
        placeholder:
          "Morning, midday, evening? How does energy and focus shift throughout your day?",
        rows: 2,
      },
      {
        id: "preferred_communication",
        label: "Preferred Communication Method",
        type: "card",
        cardOptions: [
          {
            value: "Text / SMS",
            label: "Text / SMS",
            description: "Direct and immediate",
          },
          {
            value: "Email",
            label: "Email",
            description: "Detailed and documented",
          },
          {
            value: "Phone Call",
            label: "Phone",
            description: "Voice conversations",
          },
          {
            value: "Video Call",
            label: "Video",
            description: "Face-to-face sessions",
          },
        ],
      },
      {
        id: "checkin_frequency",
        label: "Preferred Check-In Frequency",
        type: "card",
        cardOptions: [
          {
            value: "Daily",
            label: "Daily",
            description: "I want daily touchpoints",
          },
          {
            value: "Every 2–3 days",
            label: "Every 2–3 Days",
            description: "Regular but not daily",
          },
          {
            value: "Weekly",
            label: "Weekly",
            description: "Structured weekly check-ins",
          },
          {
            value: "As Needed",
            label: "As Needed",
            description: "I'll reach out when I need support",
          },
        ],
      },
      {
        id: "business_travel",
        label: "Business Travel Frequency",
        type: "select",
        options: [
          "Rarely",
          "Monthly",
          "2–3 times per month",
          "Weekly or more",
        ],
      },
    ],
  },

  // ── Phase 12: Concierge Preferences ───────────────────────────────────
  {
    title: "Concierge Preferences",
    subtitle:
      "The final configuration. This is where we fine-tune how we deliver the highest-quality, most seamless coaching experience for you specifically. No detail is too small.",
    fields: [
      {
        id: "response_time_expectation",
        label: "Expected Response Time From Your Coaching Team",
        type: "card",
        cardOptions: [
          {
            value: "Within a few hours",
            label: "Within Hours",
            description: "I expect same-day availability",
          },
          {
            value: "Same business day",
            label: "Same Day",
            description: "Response within the business day",
          },
          {
            value: "Within 24 hours",
            label: "24 Hours",
            description: "Within one business day is fine",
          },
          {
            value: "Flexible",
            label: "Flexible",
            description: "I understand the team's capacity",
          },
        ],
      },
      {
        id: "concierge_preferences",
        label: "How Can We Deliver the Best Possible Experience for You?",
        type: "textarea",
        placeholder:
          "Communication style, level of detail in check-ins, preferred format for program delivery, anything that makes you feel supported at the highest level",
        rows: 4,
      },
      {
        id: "special_considerations",
        label: "Special Considerations or Upcoming Schedule Constraints",
        type: "textarea",
        placeholder:
          "Major trips, events, work demands, board presentations, or anything that should inform how we pace the first weeks of your program",
        rows: 3,
      },
      {
        id: "executive_referral",
        label: "How Did You Learn About Executive Performance?",
        type: "text",
        placeholder: "Referral name, social platform, existing client, etc.",
      },
    ],
  },
];

export default function ExecutiveOnboardingPage() {
  return (
    <AccessGuard
      sessionKey="catalyst_executive_paid_access"
      progressKey="catalyst_executive_progress"
      redirectTo="/executive-performance-confirmed"
    >
      <OnboardingWizard
      phases={PHASES}
      heading="Executive"
      headingLine2="Performance"
      welcomeSubheading="Your private performance system starts here."
      welcomeBody="This assessment takes approximately 20–25 minutes. Every answer is used to engineer a complete, precision performance blueprint — built around your physiology, your schedule, and your standards."
      welcomeChecklist={[
        "Precision Training Program",
        "Executive Nutrition Strategy",
        "InBody H30 Body Composition Baseline",
        "Recovery & Sleep Protocol",
        "Bloodwork & Optimization Alignment",
        "Dedicated Coaching Team Access",
        "Delivered within 3–5 business days",
      ]}
      totalMinutes={25}
      scriptUrl={SCRIPT_URL}
      storageKey="catalyst_executive_progress"
      formType="executive_onboarding"
      packageType="executive"
    />
    </AccessGuard>
  );
}
