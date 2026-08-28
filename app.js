const CONFIG = window.SECURITY_ALERT_CONFIG || {};

const form = document.getElementById("incident-form");
const incidentType = document.getElementById("incident_type");
const detailsSection = document.getElementById("incident-details-section");
const dispatchSection = document.getElementById("dispatch-section");
const submitSection = document.getElementById("submit-section");
const dynamicFields = document.getElementById("dynamic-fields");
const incidentHelp = document.getElementById("incident-help");
const submitButton = document.getElementById("submit-button");
const spinner = document.querySelector(".button-spinner");
const systemMessage = document.getElementById("system-message");
const successPanel = document.getElementById("success-panel");
const successMessage = document.getElementById("success-message");
const incidentReference = document.getElementById("incident-reference");
const newReportButton = document.getElementById("new-report-button");

const fieldTemplates = {
  code_green: {
    help: "Document the Code Green occurrence and the responding personnel.",
    fields: [
      dateField(),
      timeField(),
      textField("location", "Location", true, "Building, unit, room, or area"),
      textareaField("patient_information", "Patient Information", true, "Use only the minimum necessary information permitted by policy.", "full-width", "Do not include diagnosis or unrelated medical details."),
      textField("responding_officers", "Responding Officer(s)", true, "Separate multiple names with commas", "full-width")
    ]
  },
  taser_pull: {
    help: "Document the Taser Pull and identify the deploying officer and device.",
    fields: [
      dateField(),
      timeField(),
      textField("location", "Location", true, "Building, unit, room, or area"),
      textField("deploying_officer", "Deploying Officer", true, "Officer name"),
      textField("taser_number", "Taser Number", true, "Asset or device number")
    ]
  },
  ctw: {
    help: "Document the Criminal Trespass Warning and law-enforcement response.",
    fields: [
      dateField(),
      timeField(),
      textField("location", "Location", true, "Building, unit, room, or area"),
      textField("trespass_subject", "Trespass Subject", true, "Subject name or approved identifier"),
      textareaField("reported_damages", "Reported Damages", true, "Enter None if no damages were reported.", "full-width"),
      textField("responding_law_enforcement_agency", "Responding Law Enforcement Agency", true, "Agency name", "full-width"),
      checkboxField("ctw_form_completed", "CTW form completed")
    ]
  },
  officer_injury: {
    help: "Document the officer injury and required report status.",
    fields: [
      dateField(),
      timeField(),
      textField("location", "Location", true, "Building, unit, room, or area"),
      textField("officer_name", "Officer Name", true, "Injured officer"),
      checkboxField("incident_report_completed", "Incident report completed")
    ]
  },
  insufficient_staffing: {
    help: "Record the staffing level currently on duty.",
    fields: [
      numberField("total_officers_on_duty", "Total Officers on Duty", true, 0, 200, "Enter the total number of officers currently on duty")
    ]
  }
};

function dateField() {
  return fieldHtml({
    name: "occurrence_date",
    label: "Date of Occurrence",
    type: "date",
    required: true
  });
}

function timeField() {
  return fieldHtml({
    name: "occurrence_time",
    label: "Time of Occurrence",
    type: "time",
    required: true
  });
}

function textField(name, label, required = false, placeholder = "", className = "") {
  return fieldHtml({ name, label, type: "text", required, placeholder, className, maxlength: 180 });
}

function numberField(name, label, required, min, max, placeholder = "") {
  return fieldHtml({ name, label, type: "number", required, placeholder, min, max });
}

function textareaField(name, label, required = false, placeholder = "", className = "", hint = "") {
  const requiredMark = required ? '<span aria-hidden="true">*</span>' : '<span class="optional">Optional</span>';
  return `
    <div class="field ${className}">
      <label for="${name}">${label} ${requiredMark}</label>
      <textarea id="${name}" name="${name}" rows="4" maxlength="1200" ${required ? "required" : ""} placeholder="${escapeAttr(placeholder)}"></textarea>
      ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ""}
      <p class="field-error" data-error-for="${name}"></p>
    </div>`;
}

function checkboxField(name, label) {
  return `
    <div class="field full-width">
      <div class="checkbox-row">
        <input id="${name}" name="${name}" type="checkbox" />
        <label for="${name}">${label}</label>
      </div>
    </div>`;
}

function fieldHtml({ name, label, type, required = false, placeholder = "", className = "", maxlength, min, max }) {
  const requiredMark = required ? '<span aria-hidden="true">*</span>' : '<span class="optional">Optional</span>';
  const attrs = [
    required ? "required" : "",
    maxlength ? `maxlength="${maxlength}"` : "",
    min !== undefined ? `min="${min}"` : "",
    max !== undefined ? `max="${max}"` : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="field ${className}">
      <label for="${name}">${label} ${requiredMark}</label>
      <input id="${name}" name="${name}" type="${type}" ${attrs} placeholder="${escapeAttr(placeholder)}" />
      <p class="field-error" data-error-for="${name}"></p>
    </div>`;
}

incidentType.addEventListener("change", () => {
  clearSystemMessage();
  clearErrors();
  const selected = incidentType.value;

  if (!selected || !fieldTemplates[selected]) {
    dynamicFields.innerHTML = "";
    detailsSection.classList.add("hidden");
    dispatchSection.classList.add("hidden");
    submitSection.classList.add("hidden");
    return;
  }

  const template = fieldTemplates[selected];
  incidentHelp.textContent = template.help;
  dynamicFields.innerHTML = template.fields.join("");
  detailsSection.classList.remove("hidden");
  dispatchSection.classList.remove("hidden");
  submitSection.classList.remove("hidden");

  if (selected !== "insufficient_staffing") {
    setDefaultOccurrenceDateTime();
  }

  detailsSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

function setDefaultOccurrenceDateTime() {
  const now = new Date();
  const dateInput = document.getElementById("occurrence_date");
  const timeInput = document.getElementById("occurrence_time");
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  if (dateInput && !dateInput.value) dateInput.value = localDate.toISOString().slice(0, 10);
  if (timeInput && !timeInput.value) timeInput.value = localDate.toISOString().slice(11, 16);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearSystemMessage();
  clearErrors();

  if (!validateForm()) {
    showSystemMessage("Please complete the highlighted required fields before submitting.", "error");
    const firstInvalid = form.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  const payload = collectPayload();
  setSubmitting(true);

  try {
    let result;
    if (CONFIG.DEMO_MODE) {
      await delay(700);
      result = {
        ok: true,
        incident_id: `DEMO-${Date.now().toString().slice(-8)}`,
        email_status: "demo",
        sms_status: "demo"
      };
    } else {
      result = await submitIncident(payload);
    }

    showSuccess(result);
  } catch (error) {
    console.error(error);
    showSystemMessage(
      "The incident could not be submitted. Do not rely on this form for notification. Use your approved backup notification process and contact a supervisor directly.",
      "error"
    );
  } finally {
    setSubmitting(false);
  }
});

function collectPayload() {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.ctw_form_completed = document.getElementById("ctw_form_completed")?.checked || false;
  data.incident_report_completed = document.getElementById("incident_report_completed")?.checked || false;
  data.client_submitted_at = new Date().toISOString();

  return data;
}

async function submitIncident(payload) {
  if (!CONFIG.SUPABASE_FUNCTION_URL || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes("YOUR_")) {
    throw new Error("Production endpoint is not configured.");
  }

  const response = await fetch(CONFIG.SUPABASE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": CONFIG.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(body.error || `Submission failed (${response.status})`);
  }
  return body;
}

function validateForm() {
  let valid = true;
  const visibleRequired = [...form.querySelectorAll("[required]")].filter((el) => !el.closest(".hidden"));

  for (const field of visibleRequired) {
    const isValid = field.checkValidity() && String(field.value || "").trim() !== "";
    field.setAttribute("aria-invalid", isValid ? "false" : "true");
    const error = document.querySelector(`[data-error-for="${field.name}"]`);
    if (error) error.textContent = isValid ? "" : "Required field";
    if (!isValid) valid = false;
  }

  return valid;
}

function clearErrors() {
  document.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute("aria-invalid"));
  document.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  spinner.classList.toggle("hidden", !isSubmitting);
  submitButton.querySelector(".button-label").textContent = isSubmitting
    ? "Submitting Incident..."
    : "Submit Incident & Notify Supervisors";
}

function showSuccess(result) {
  form.classList.add("hidden");
  systemMessage.classList.add("hidden");
  successPanel.classList.remove("hidden");

  const notificationSummary = CONFIG.DEMO_MODE
    ? "Demo mode is active. The form workflow completed, but no email or text message was sent."
    : notificationText(result);

  successMessage.textContent = notificationSummary;
  incidentReference.textContent = result.incident_id ? `Incident Reference: ${result.incident_id}` : "";
  successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function notificationText(result) {
  if (result.email_status === "sent" && result.sms_status === "sent") {
    return "The incident was recorded and supervisor email and text notifications were sent.";
  }
  if (result.email_status === "sent" || result.sms_status === "sent") {
    return "The incident was recorded, but only one notification channel confirmed delivery. Follow your backup notification process if immediate awareness is required.";
  }
  return "The incident was recorded, but supervisor notification delivery was not confirmed. Follow your approved backup notification process.";
}

newReportButton.addEventListener("click", () => {
  form.reset();
  dynamicFields.innerHTML = "";
  detailsSection.classList.add("hidden");
  dispatchSection.classList.add("hidden");
  submitSection.classList.add("hidden");
  successPanel.classList.add("hidden");
  form.classList.remove("hidden");
  incidentType.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function showSystemMessage(message, type) {
  systemMessage.textContent = message;
  systemMessage.className = `system-message ${type}`;
}

function clearSystemMessage() {
  systemMessage.textContent = "";
  systemMessage.className = "system-message hidden";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function escapeAttr(value) { return escapeHtml(value); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

if (CONFIG.DEMO_MODE) {
  showSystemMessage("Demo mode is active. Submissions will be simulated and will not send supervisor notifications until the production endpoint is configured.", "warning");
}
