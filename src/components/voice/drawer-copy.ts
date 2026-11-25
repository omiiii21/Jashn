/**
 * The flags drawer's fixed texts (flagsmith.md 1.2 and 5.9; acceptance AT-1.8 and AT-1.9).
 * The heading, the AT-1.8 line and the disclosure are word for word from the specs; a unit
 * test reads the spec files and checks each one. English only: the drawer is the team's view.
 */

export const DRAWER_COPY = {
  /** The chip popover's button, and the drawer's title (3.1). */
  open_button: "Flags and experiment",
  title: "Flags and experiment",
  description: "The team's view of Flagsmith for this session. Internal accounts only.",

  // Part 1
  session_heading: "This session",
  identity: "Identity key",
  identity_missing: "None (FLAGSMITH_ID_SALT isn't set, so nobody is identified)",
  env_label: "env_label",
  expected: "expected",
  environment_key: "Environment key",
  environment_key_missing: "Not set",
  evaluated: "Evaluated",
  flag: "Flag",
  state: "State",
  value: "Value or variant",
  reason: "Reason",
  on: "on",
  off: "off",
  fallback: "fallback",
  all_fallback:
    "Flagsmith couldn't be read for this render, so every flag marked fallback shows the app's built-in value, not Flagsmith's.",

  // Part 2
  sent_heading: "Sent by Jashn (app-side counts, not Flagsmith's statistics)",
  sent_line:
    "Flagsmith shows statistics from 50 owners and 5 saves per arm. A 10-point effect needs about 385 per arm. We claim no winner.",
  sent_scope: "Production only, counted from experiment_exposures.",
  arm: "Arm",
  exposures: "Exposures",
  saves: "Saves",
  as_of: "As of",

  // Part 3
  synthetic_heading: "Synthetic data",
  synthetic_banner: "Synthetic data",
  synthetic_disclosure:
    "Synthetic data: 800 scripted owners in a separate Flagsmith environment, with save rates planted at 50% (form-first) and 60% (voice-first). It tests the experiment's wiring, not the product.",
  synthetic_pointer:
    "The scripted run's results are in Flagsmith's Synthetic environment, on the experiment page \"SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60%\". Jashn shows no synthetic numbers.",

  // Part 4
  health_heading: "Health",
  check_heading: "Latest self-check",
  check_pass: "Passing",
  check_fail: "Failing",
  run_check: "Run check again",
  running_check: "Checking…",
  run_probes: "Run 50 probes",
  running_probes: "Running probes…",
  probes_note: "Evaluation only: probes send no events, so they are never exposed.",
  probe: "Probe",
  in_experiment: "In experiment",
  turns_heading: "Production voice turns, last 2 hours",
  turns_total: "Total",
  turns_failed: "Failed",
  turns_paused: "Paused",
  loading: "Loading…",
  refused: "Only internal accounts can read this.",
  failed: "Couldn't load this. Try again.",
  sdk_probe: "SDK probe",
} as const;

/** The variation labels as Flagsmith shows them (3.4). */
export const ARM_LABELS: Record<string, string> = {
  form_first: "form_first (control)",
  voice_first: "voice_first",
};
