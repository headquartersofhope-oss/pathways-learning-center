/**
 * PATHWAYS LEARNING CENTER — Automated Content View Logger + Invoice Generator
 * © REJG Legacy Labs LLC — All Rights Reserved
 *
 * PURPOSE:
 * Every time a resident watches a class, this system automatically:
 *   1. Logs the view event to ContentViewLog (for invoicing + funder reporting)
 *   2. At month-end: generates InvoiceRecord per organization
 *   3. On demand: generates FunderReport for grant submissions
 *
 * USAGE IN BASE44 BACKEND:
 *   import { logContentView, generateMonthlyInvoice, generateFunderReport } from './content-view-logger.js'
 */

// ═══════════════════════════════════════════════════════════
// CONTENT VIEW LOG SCHEMA
// ═══════════════════════════════════════════════════════════

/**
 * Logged automatically every time a resident watches a video.
 * This is the source of truth for billing and funder reporting.
 *
 * @typedef {Object} ContentViewLog
 * @property {string} id - Auto-generated
 * @property {string} org_id - Organization ID (e.g. "hoh-foundation")
 * @property {string} org_name - Organization name (e.g. "HOH Foundation")
 * @property {string} user_id - Resident's user ID
 * @property {string} resident_name - First name only (HIPAA-safe for invoicing)
 * @property {string} class_number - e.g. "1.3"
 * @property {string} class_title - e.g. "Building Your Personal 90-Day Plan"
 * @property {number} track_number - 1-10
 * @property {string} track_name - e.g. "Reentry Success"
 * @property {string} video_id - HeyGen video ID
 * @property {number} watch_duration_seconds - How long they actually watched
 * @property {number} watch_percentage - 0-100
 * @property {boolean} completed - Did they finish the video
 * @property {boolean} quiz_passed - Did they pass the knowledge check
 * @property {number} quiz_score - 0-3
 * @property {string} session_date - YYYY-MM-DD
 * @property {string} session_start - ISO timestamp
 * @property {string} session_end - ISO timestamp
 * @property {string} device_type - "mobile" | "tablet" | "desktop"
 * @property {boolean} is_required - Was this an assigned class or elective
 * @property {string} class_type - "core" | "enrichment"
 * @property {string} billing_month - YYYY-MM (for invoice grouping)
 */

// ═══════════════════════════════════════════════════════════
// LOG A CONTENT VIEW EVENT
// ═══════════════════════════════════════════════════════════

export async function logContentView(context, eventData) {
  const {
    org_id, org_name,
    user_id, resident_name,
    class_number, class_title, track_number, track_name,
    video_id,
    watch_duration_seconds, watch_percentage,
    completed, quiz_passed, quiz_score,
    device_type = 'unknown',
    is_required = true,
    class_type = 'core'
  } = eventData;

  const now = new Date();
  const session_date = now.toISOString().split('T')[0];
  const billing_month = session_date.substring(0, 7); // YYYY-MM

  const logEntry = {
    org_id,
    org_name,
    user_id,
    resident_name,
    class_number: String(class_number || ''),
    class_title,
    track_number,
    track_name,
    video_id,
    watch_duration_seconds: Math.round(watch_duration_seconds || 0),
    watch_percentage: Math.round(watch_percentage || 0),
    completed: Boolean(completed),
    quiz_passed: Boolean(quiz_passed),
    quiz_score: quiz_score || 0,
    session_date,
    session_start: eventData.session_start || now.toISOString(),
    session_end: now.toISOString(),
    device_type,
    is_required,
    class_type,
    billing_month,
  };

  // Save to ContentViewLog entity
  await context.entities.ContentViewLog.create(logEntry);

  // Check if this completes a track — if so, trigger certificate
  if (completed && quiz_passed) {
    await checkTrackCompletion(context, { user_id, org_id, track_number });
  }

  return logEntry;
}

// ═══════════════════════════════════════════════════════════
// TRACK COMPLETION CHECK — triggers certificate
// ═══════════════════════════════════════════════════════════

async function checkTrackCompletion(context, { user_id, org_id, track_number }) {
  const TRACK_CLASS_COUNTS = { 1:14, 2:14, 3:14, 4:14, 5:14, 6:16, 7:14, 8:14, 9:14, 10:12 };
  const required = TRACK_CLASS_COUNTS[track_number] || 14;

  // Count completed classes in this track for this user
  const completed = await context.entities.UserProgress.filter({
    user_id,
    track_number,
    completed: true,
    quiz_passed: true
  });

  if (completed.length >= required) {
    // Check if certificate already issued
    const existing = await context.entities.Certificate.filter({ user_id, track_number });
    if (existing.length === 0) {
      await context.entities.Certificate.create({
        user_id,
        org_id,
        track_number,
        track_name: getTrackName(track_number),
        issued_at: new Date().toISOString(),
        status: 'issued'
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MONTHLY INVOICE GENERATOR
// ═══════════════════════════════════════════════════════════

/**
 * Run at end of each month. Generates one invoice per active organization.
 * Called automatically by a scheduled Base44 function on the 1st of each month.
 *
 * @param {string} billing_month - YYYY-MM format
 */
export async function generateMonthlyInvoice(context, billing_month) {
  // Get all view logs for this billing month
  const logs = await context.entities.ContentViewLog.filter({ billing_month });

  // Group by org
  const byOrg = {};
  for (const log of logs) {
    if (!byOrg[log.org_id]) {
      byOrg[log.org_id] = {
        org_id: log.org_id,
        org_name: log.org_name,
        logs: [],
        unique_users: new Set(),
        classes_completed: 0,
        total_watch_minutes: 0,
        certificates_issued: 0,
      };
    }
    const org = byOrg[log.org_id];
    org.logs.push(log);
    org.unique_users.add(log.user_id);
    if (log.completed) org.classes_completed++;
    org.total_watch_minutes += Math.round((log.watch_duration_seconds || 0) / 60);
  }

  // Create invoice records
  const invoices = [];
  for (const [org_id, data] of Object.entries(byOrg)) {
    const active_users = data.unique_users.size;

    // Get org's license tier to determine pricing
    const org = await context.entities.Organization.filter({ org_id });
    const tier = org[0]?.license_tier || 'standard';

    const rate_per_user = { standard: 15, pro: 25, enterprise: 0 }[tier]; // enterprise = annual flat
    const amount_due = tier === 'enterprise' ? 0 : active_users * rate_per_user;

    const invoice = {
      org_id,
      org_name: data.org_name,
      billing_month,
      active_users,
      classes_completed: data.classes_completed,
      total_watch_minutes: data.total_watch_minutes,
      license_tier: tier,
      rate_per_user,
      amount_due,
      invoice_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: tier === 'enterprise' ? 'included_in_contract' : 'pending',
      line_items: JSON.stringify([
        { description: `Active users — ${billing_month}`, quantity: active_users, unit_price: rate_per_user, total: amount_due },
        { description: `Classes completed`, quantity: data.classes_completed, unit_price: 0, total: 0 },
        { description: `Total learning minutes`, quantity: data.total_watch_minutes, unit_price: 0, total: 0 },
      ])
    };

    await context.entities.InvoiceRecord.create(invoice);
    invoices.push(invoice);
  }

  return invoices;
}

// ═══════════════════════════════════════════════════════════
// FUNDER REPORT GENERATOR
// ═══════════════════════════════════════════════════════════

/**
 * Generates a grant reporting summary for a specified date range.
 * Run on-demand before grant report submissions.
 *
 * @param {string} org_id - Which org to report on
 * @param {string} start_date - YYYY-MM-DD
 * @param {string} end_date - YYYY-MM-DD
 * @param {string} funder_name - Name of the grant funder (for the report header)
 */
export async function generateFunderReport(context, { org_id, start_date, end_date, funder_name }) {
  // Pull all view logs for this org in date range
  const logs = await context.entities.ContentViewLog.filter({ org_id });
  const filtered = logs.filter(l => l.session_date >= start_date && l.session_date <= end_date);

  const unique_residents = new Set(filtered.map(l => l.user_id)).size;
  const classes_completed = filtered.filter(l => l.completed).length;
  const quizzes_passed = filtered.filter(l => l.quiz_passed).length;
  const total_hours = Math.round(filtered.reduce((sum, l) => sum + (l.watch_duration_seconds || 0), 0) / 3600);
  const certificates = await context.entities.Certificate.filter({ org_id });
  const certs_in_range = certificates.filter(c => c.issued_at >= start_date && c.issued_at <= end_date);

  // Class breakdown by track
  const by_track = {};
  for (const log of filtered.filter(l => l.completed)) {
    const key = `Track ${log.track_number}: ${log.track_name}`;
    by_track[key] = (by_track[key] || 0) + 1;
  }

  // Class type breakdown
  const core_completions = filtered.filter(l => l.completed && l.class_type === 'core').length;
  const enrichment_completions = filtered.filter(l => l.completed && l.class_type === 'enrichment').length;

  const report = {
    org_id,
    funder_name,
    report_period: `${start_date} to ${end_date}`,
    generated_at: new Date().toISOString(),

    // Headline numbers (what funders want to see)
    total_unique_residents_served: unique_residents,
    total_classes_completed: classes_completed,
    total_learning_hours: total_hours,
    total_quizzes_passed: quizzes_passed,
    total_certificates_issued: certs_in_range.length,
    core_curriculum_completions: core_completions,
    enrichment_class_completions: enrichment_completions,

    // Breakdown by track
    completions_by_track: by_track,

    // Outcome indicators
    knowledge_check_pass_rate: filtered.length > 0
      ? Math.round((quizzes_passed / filtered.filter(l => l.completed).length) * 100) + '%'
      : '0%',

    average_classes_per_resident: unique_residents > 0
      ? Math.round(classes_completed / unique_residents)
      : 0,

    // Raw data summary for appendix
    total_video_views: filtered.length,
    total_watch_sessions: filtered.length,
    mobile_sessions: filtered.filter(l => l.device_type === 'mobile').length,
    desktop_sessions: filtered.filter(l => l.device_type === 'desktop').length,
  };

  // Save to FunderReport entity
  await context.entities.FunderReport.create({
    ...report,
    completions_by_track: JSON.stringify(by_track),
    status: 'generated'
  });

  return report;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getTrackName(track_number) {
  const names = {
    1: 'Reentry Success & Life at HOH',
    2: 'Financial Literacy',
    3: 'Employment & Career Development',
    4: 'Housing & Tenant Rights',
    5: 'Legal & Civic Literacy',
    6: 'Health & Wellness',
    7: 'Sobriety & Recovery',
    8: 'Family & Relationships',
    9: 'Digital Literacy & Tech',
    10: 'Leadership & Entrepreneurship',
  };
  return names[track_number] || `Track ${track_number}`;
}
