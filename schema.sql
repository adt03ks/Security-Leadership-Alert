-- Run this in the Supabase SQL Editor.
-- The browser never writes directly to this table; the Edge Function uses the service-role key.

create extension if not exists pgcrypto;

create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null check (incident_type in (
    'code_green',
    'taser_pull',
    'ctw',
    'officer_injury',
    'insufficient_staffing'
  )),
  occurrence_date date,
  occurrence_time time,
  location text,
  patient_information text,
  responding_officers text,
  deploying_officer text,
  taser_number text,
  trespass_subject text,
  reported_damages text,
  responding_law_enforcement_agency text,
  ctw_form_completed boolean not null default false,
  incident_report_completed boolean not null default false,
  officer_name text,
  total_officers_on_duty integer,
  submitted_by text not null,
  dispatch_unit text,
  additional_notes text,
  client_submitted_at timestamptz,
  submitted_at timestamptz not null default now(),
  email_status text not null default 'pending',
  sms_status text not null default 'pending'
);

alter table public.security_incidents enable row level security;

-- Intentionally no anon INSERT/SELECT policies.
-- Only the Edge Function, using SUPABASE_SERVICE_ROLE_KEY, should access this table.

create index if not exists security_incidents_submitted_at_idx
  on public.security_incidents (submitted_at desc);

create index if not exists security_incidents_type_idx
  on public.security_incidents (incident_type);
