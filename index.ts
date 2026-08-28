import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const SUPERVISOR_PHONES = splitEnv("SUPERVISOR_PHONES");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ALERT_FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") || "";
const SUPERVISOR_EMAILS = splitEnv("SUPERVISOR_EMAILS");
const ALLOWED_ORIGINS = splitEnv("ALLOWED_ORIGINS");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const allowedIncidentTypes = new Set([
  "code_green",
  "taser_pull",
  "ctw",
  "officer_injury",
  "insufficient_staffing"
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, cors);
  }

  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, cors);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, cors);
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return json({ ok: false, error: validationError }, 400, cors);
  }

  const record = normalizeRecord(payload);

  const { data: inserted, error: insertError } = await supabase
    .from("security_incidents")
    .insert(record)
    .select("id, submitted_at")
    .single();

  if (insertError) {
    console.error("Database insert failed", insertError);
    return json({ ok: false, error: "Incident could not be recorded" }, 500, cors);
  }

  const incidentId = inserted.id as string;
  const alert = buildMinimalAlert(record, incidentId);

  const [emailResult, smsResult] = await Promise.allSettled([
    sendEmailAlert(alert),
    sendSmsAlerts(alert)
  ]);

  const emailStatus = statusFromResult(emailResult);
  const smsStatus = statusFromResult(smsResult);

  await supabase
    .from("security_incidents")
    .update({ email_status: emailStatus, sms_status: smsStatus })
    .eq("id", incidentId);

  return json({
    ok: true,
    incident_id: incidentId,
    email_status: emailStatus,
    sms_status: smsStatus
  }, 200, cors);
});

function validatePayload(p: Record<string, unknown>): string | null {
  const type = str(p.incident_type);
  if (!allowedIncidentTypes.has(type)) return "A valid incident type is required";
  if (!str(p.submitted_by)) return "Dispatch officer / submitted by is required";

  if (type === "insufficient_staffing") {
    const count = Number(p.total_officers_on_duty);
    if (!Number.isInteger(count) || count < 0 || count > 200) {
      return "Total officers on duty must be a whole number between 0 and 200";
    }
    return null;
  }

  if (!str(p.occurrence_date)) return "Date of occurrence is required";
  if (!str(p.occurrence_time)) return "Time of occurrence is required";
  if (!str(p.location)) return "Location is required";

  if (type === "code_green") {
    if (!str(p.patient_information)) return "Patient information is required";
    if (!str(p.responding_officers)) return "Responding officer(s) are required";
  }

  if (type === "taser_pull") {
    if (!str(p.deploying_officer)) return "Deploying officer is required";
    if (!str(p.taser_number)) return "Taser number is required";
  }

  if (type === "ctw") {
    if (!str(p.trespass_subject)) return "Trespass subject is required";
    if (!str(p.reported_damages)) return "Reported damages is required; enter None if applicable";
    if (!str(p.responding_law_enforcement_agency)) return "Responding law enforcement agency is required";
  }

  if (type === "officer_injury" && !str(p.officer_name)) {
    return "Officer name is required";
  }

  return null;
}

function normalizeRecord(p: Record<string, unknown>) {
  const type = str(p.incident_type);
  return {
    incident_type: type,
    occurrence_date: nullIfEmpty(p.occurrence_date),
    occurrence_time: nullIfEmpty(p.occurrence_time),
    location: clean(p.location, 300),
    patient_information: clean(p.patient_information, 1200),
    responding_officers: clean(p.responding_officers, 500),
    deploying_officer: clean(p.deploying_officer, 180),
    taser_number: clean(p.taser_number, 120),
    trespass_subject: clean(p.trespass_subject, 300),
    reported_damages: clean(p.reported_damages, 1200),
    responding_law_enforcement_agency: clean(p.responding_law_enforcement_agency, 300),
    ctw_form_completed: Boolean(p.ctw_form_completed),
    incident_report_completed: Boolean(p.incident_report_completed),
    officer_name: clean(p.officer_name, 180),
    total_officers_on_duty: type === "insufficient_staffing" ? Number(p.total_officers_on_duty) : null,
    submitted_by: clean(p.submitted_by, 180),
    dispatch_unit: clean(p.dispatch_unit, 180),
    additional_notes: clean(p.additional_notes, 1500),
    client_submitted_at: nullIfEmpty(p.client_submitted_at)
  };
}

function buildMinimalAlert(record: Record<string, unknown>, incidentId: string) {
  const label = incidentLabel(String(record.incident_type));
  const when = record.occurrence_date
    ? `${record.occurrence_date} ${record.occurrence_time || ""}`.trim()
    : "Reported during current shift";
  const location = record.location ? String(record.location) : "Not applicable";
  const submittedBy = String(record.submitted_by || "Security Dispatch");

  // Deliberately excludes patient information, subject details, notes, and other sensitive narrative data.
  return {
    subject: `SECURITY LEADERSHIP ALERT: ${label}`,
    text: [
      `SECURITY LEADERSHIP ALERT`,
      `Incident: ${label}`,
      `Occurrence: ${when}`,
      `Location: ${location}`,
      `Submitted by: ${submittedBy}`,
      `Reference: ${incidentId}`,
      `Review the approved incident system for full details.`
    ].join("\n")
  };
}

async function sendEmailAlert(alert: { subject: string; text: string }) {
  if (!RESEND_API_KEY || !ALERT_FROM_EMAIL || SUPERVISOR_EMAILS.length === 0) {
    return { configured: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to: SUPERVISOR_EMAILS,
      subject: alert.subject,
      text: alert.text
    })
  });

  if (!response.ok) {
    throw new Error(`Email service failed: ${response.status}`);
  }

  return { configured: true };
}

async function sendSmsAlerts(alert: { subject: string; text: string }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || SUPERVISOR_PHONES.length === 0) {
    return { configured: false };
  }

  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const failures: string[] = [];

  for (const phone of SUPERVISOR_PHONES) {
    const body = new URLSearchParams({
      From: TWILIO_FROM_NUMBER,
      To: phone,
      Body: alert.text
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    if (!response.ok) failures.push(phone);
  }

  if (failures.length > 0) {
    throw new Error(`SMS failed for ${failures.length} recipient(s)`);
  }

  return { configured: true };
}

function statusFromResult(result: PromiseSettledResult<{ configured: boolean }>) {
  if (result.status === "rejected") return "failed";
  return result.value.configured ? "sent" : "not_configured";
}

function incidentLabel(type: string) {
  return ({
    code_green: "Code Green",
    taser_pull: "Taser Pull",
    ctw: "CTW (Criminal Trespass Warning)",
    officer_injury: "Officer Injury",
    insufficient_staffing: "Insufficient Staffing"
  } as Record<string, string>)[type] || type;
}

function splitEnv(name: string) {
  return (Deno.env.get(name) || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function str(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function nullIfEmpty(v: unknown) { return str(v) || null; }
function clean(v: unknown, max: number) { const s = str(v); return s ? s.slice(0, max) : null; }

function corsHeaders(origin: string) {
  const allowedOrigin = ALLOWED_ORIGINS.length === 0
    ? "*"
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
