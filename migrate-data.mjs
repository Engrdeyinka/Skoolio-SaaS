/**
 * migrate-data.mjs
 * Migrates all Base44 CSV exports into Supabase.
 *
 * Usage:
 *   node migrate-data.mjs <service_role_key>
 *
 * Get your service role key from:
 *   Supabase Dashboard → Settings → API → "service_role" (secret key)
 *
 * Or add to .env:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * Then run:
 *   node migrate-data.mjs
 *
 * Prerequisites — run this SQL in Supabase first (migrate-columns.sql).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = join(__dir, '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL      = env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.argv[2] || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL missing from .env');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('Usage: node migrate-data.mjs <service_role_key>');
  console.error('  Get it from: Supabase Dashboard → Settings → API → service_role');
  console.error('  Or set SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Service role key bypasses RLS — no login required
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── CSV Parser (handles quoted fields, embedded commas and quotes) ─────────────
function parseCSV(csvText) {
  const rows = [];
  let row = [], field = '', inQ = false, i = 0;
  // normalise line endings
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < text.length) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { field += '"'; i += 2; }
      else if (ch === '"')          { inQ = false; i++; }
      else                          { field += ch; i++; }
    } else {
      if      (ch === '"')  { inQ = true; i++; }
      else if (ch === ',')  { row.push(field); field = ''; i++; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
      else                  { field += ch; i++; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1)
    .filter(r => r.some(v => v.trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

// ── File helpers ──────────────────────────────────────────────────────────────
const DOWNLOADS = resolve(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');

function readCSV(filename) {
  const path = join(DOWNLOADS, filename);
  if (!existsSync(path)) {
    console.warn(`  ⚠️  Not found: ${path} — skipping`);
    return [];
  }
  const rows = parseCSV(readFileSync(path, 'utf-8'));
  console.log(`  📂 ${filename}: ${rows.length} rows`);
  return rows;
}

// ── Type helpers ──────────────────────────────────────────────────────────────
const orNull = v => (v === '' || v === undefined || v === null) ? null : v;
const parseNum  = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const parseBool = v => v === 'true' ? true : v === 'false' ? false : null;
const parseArr  = v => { try { return v ? JSON.parse(v) : []; } catch { return []; } };
const parseJSON = v => { try { return v && v !== '{}' ? JSON.parse(v) : {}; } catch { return {}; } };
const parseDate = v => {
  if (!v || !v.trim()) return null;
  // Handle M/D/YYYY
  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  return v.split('T')[0] || null;
};
const parseTS = v => orNull(v?.trim());

// Supabase batch insert (chunk of 50)
async function batchInsert(table, records) {
  let ok = 0, fail = 0;
  const CHUNK = 50;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { data, error } = await supabase.from(table).insert(chunk).select('id');
    if (error) {
      console.error(`    ❌ ${table} batch ${i}-${i+chunk.length}:`, error.message);
      fail += chunk.length;
    } else {
      ok += (data?.length ?? chunk.length);
    }
  }
  return { ok, fail };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Starting migration (service role — no sign-in needed)\n');

  // ID mapping: Base44 id → new Supabase UUID
  const teacherMap = {};
  const studentMap = {};
  const quizMap    = {};

  // ══ 1. TEACHERS ════════════════════════════════════════════════════════════
  console.log('👨‍🏫 Migrating teachers...');
  const teacherRows = readCSV('Teacher_export.csv');
  const teacherRecords = [];
  const teacherOldIds  = [];
  for (const t of teacherRows) {
    if (!t.first_name && !t.last_name) continue;
    teacherOldIds.push(t.id);
    teacherRecords.push({
      first_name:            orNull(t.first_name) ?? '',
      last_name:             orNull(t.last_name)  ?? '',
      email:                 orNull(t.email),
      phone:                 orNull(t.phone),
      qualification:         orNull(t.qualification),
      address:               orNull(t.address),
      subject_specialization: orNull(t.subject_specialization),
      employment_date:       parseDate(t.employment_date),
      employment_status:     orNull(t.employment_status) ?? 'active',
      classes_assigned:      parseArr(t.classes_assigned),
      salary:                parseNum(t.salary) ?? 0,
      created_date:          parseTS(t.created_date),
    });
  }
  // Insert one-by-one to capture returned IDs in order
  let tOk = 0, tFail = 0;
  for (let i = 0; i < teacherRecords.length; i++) {
    const { data, error } = await supabase.from('teachers').insert(teacherRecords[i]).select('id').single();
    if (error) { console.error(`  ❌ Teacher ${teacherRecords[i].first_name}:`, error.message); tFail++; }
    else { teacherMap[teacherOldIds[i]] = data.id; tOk++; }
  }
  console.log(`  ✅ ${tOk} imported, ${tFail} failed\n`);

  // ══ 2. STUDENTS ════════════════════════════════════════════════════════════
  console.log('🎓 Migrating students...');
  const studentRows = readCSV('Student_export.csv');
  let sOk = 0, sFail = 0;
  for (const s of studentRows) {
    if (!s.first_name && !s.last_name) continue;
    const rec = {
      first_name:               orNull(s.first_name) ?? '',
      last_name:                orNull(s.last_name)  ?? '',
      parent_name:              orNull(s.parent_name) ?? '',
      parent_email:             orNull(s.parent_email),
      parent_phone:             orNull(s.parent_phone),
      address:                  orNull(s.address),
      state_of_origin:          orNull(s.state_of_origin),
      date_of_birth:            parseDate(s.date_of_birth),
      grade:                    orNull(s.grade) ?? '',
      enrollment_status:        orNull(s.enrollment_status) ?? 'active',
      enrollment_date:          parseDate(s.enrollment_date),
      termly_tuition:           parseNum(s.termly_tuition) ?? 0,
      emergency_contact_name:   orNull(s.emergency_contact_name),
      emergency_contact_phone:  orNull(s.emergency_contact_phone),
      medical_notes:            orNull(s.medical_notes),
      created_date:             parseTS(s.created_date),
    };
    const { data, error } = await supabase.from('students').insert(rec).select('id').single();
    if (error) { console.error(`  ❌ Student ${s.first_name} ${s.last_name}:`, error.message); sFail++; }
    else { studentMap[s.id] = data.id; sOk++; }
  }
  console.log(`  ✅ ${sOk} imported, ${sFail} failed\n`);

  // ══ 3. SUBJECTS ════════════════════════════════════════════════════════════
  console.log('📚 Migrating subjects...');
  const subjectRows = readCSV('Subject_export.csv');
  const subjectRecs = subjectRows
    .filter(s => s.subject_name)
    .map(s => ({
      subject_name:  s.subject_name,
      subject_code:  orNull(s.subject_code),
      description:   orNull(s.description),
      grade_levels:  parseArr(s.grade_levels),
      created_date:  parseTS(s.created_date),
    }));
  const { ok: subOk, fail: subFail } = await batchInsert('subjects', subjectRecs);
  console.log(`  ✅ ${subOk} imported, ${subFail} failed\n`);

  // ══ 4. QUIZZES ═════════════════════════════════════════════════════════════
  console.log('📝 Migrating quizzes...');
  const quizRows = readCSV('Quiz_export.csv');
  let qzOk = 0, qzFail = 0;
  for (const q of quizRows) {
    if (!q.title) continue;
    const rec = {
      title:            q.title,
      description:      orNull(q.description),
      subject:          orNull(q.subject),
      grade:            orNull(q.grade),
      term:             orNull(q.term),
      academic_year:    orNull(q.academic_year),
      test_type:        orNull(q.test_type),
      duration_minutes: parseNum(q.duration_minutes) ?? 30,
      is_published:     true,
      created_date:     parseTS(q.created_date),
    };
    const { data, error } = await supabase.from('quizzes').insert(rec).select('id').single();
    if (error) { console.error(`  ❌ Quiz "${q.title}":`, error.message); qzFail++; }
    else { quizMap[q.id] = data.id; qzOk++; }
  }
  console.log(`  ✅ ${qzOk} imported, ${qzFail} failed\n`);

  // ══ 5. QUESTIONS ═══════════════════════════════════════════════════════════
  console.log('❓ Migrating questions...');
  const questionRows = readCSV('Question_export.csv');
  const questionRecs = [];
  for (const q of questionRows) {
    const newQuizId = quizMap[q.quiz_id];
    if (!newQuizId) continue;
    questionRecs.push({
      quiz_id:              newQuizId,
      text:                 orNull(q.text) ?? '',
      question_type:        orNull(q.question_type) ?? 'multiple_choice',
      options:              parseArr(q.options),
      correct_option_index: parseNum(q.correct_option_index),
      marks:                parseNum(q.max_score) ?? parseNum(q.marks) ?? 1,
      image_url:            orNull(q.image_url),
      explanation:          orNull(q.explanation),
      created_date:         parseTS(q.created_date),
    });
  }
  const { ok: qqOk, fail: qqFail } = await batchInsert('questions', questionRecs);
  console.log(`  ✅ ${qqOk} imported, ${qqFail} failed\n`);

  // ══ 6. PAYMENTS ════════════════════════════════════════════════════════════
  console.log('💳 Migrating payments...');
  const paymentRows = readCSV('Payment_export.csv');
  const paymentRecs = [];
  let paySkip = 0;
  for (const p of paymentRows) {
    const newStudentId = studentMap[p.student_id];
    if (!newStudentId) { paySkip++; continue; }
    paymentRecs.push({
      student_id:     newStudentId,
      amount:         parseNum(p.amount) ?? 0,
      payment_date:   parseDate(p.payment_date),
      payment_method: orNull(p.payment_method),
      payment_status: orNull(p.payment_status) ?? 'pending',
      term:           orNull(p.term),
      academic_year:  orNull(p.academic_year),
      notes:          orNull(p.notes),
      due_date:       parseDate(p.due_date),
      created_date:   parseTS(p.created_date),
    });
  }
  const { ok: pyOk, fail: pyFail } = await batchInsert('payments', paymentRecs);
  console.log(`  ✅ ${pyOk} imported, ${pyFail} failed, ${paySkip} skipped (student not found)\n`);

  // ══ 7. ATTENDANCE ══════════════════════════════════════════════════════════
  console.log('📅 Migrating attendance...');
  const attendanceRows = readCSV('Attendance_export.csv');
  const attendanceRecs = [];
  let attSkip = 0;
  for (const a of attendanceRows) {
    const newStudentId = studentMap[a.student_id];
    if (!newStudentId) { attSkip++; continue; }
    attendanceRecs.push({
      student_id:      newStudentId,
      attendance_date: parseDate(a.attendance_date),
      status:          orNull(a.status),
      grade:           orNull(a.grade),
      term:            orNull(a.term),
      academic_year:   orNull(a.academic_year),
      created_date:    parseTS(a.created_date),
    });
  }
  const { ok: atOk, fail: atFail } = await batchInsert('attendance', attendanceRecs);
  console.log(`  ✅ ${atOk} imported, ${atFail} failed, ${attSkip} skipped\n`);

  // ══ 8. EXAM RESULTS ════════════════════════════════════════════════════════
  console.log('📊 Migrating exam results...');
  const examRows = readCSV('ExamResult_export.csv');
  const examRecs = [];
  let exSkip = 0;
  for (const e of examRows) {
    const newStudentId = studentMap[e.student_id];
    if (!newStudentId) { exSkip++; continue; }
    examRecs.push({
      student_id:           newStudentId,
      subject_name:         orNull(e.subject_name) ?? '',
      term:                 orNull(e.term),
      academic_year:        orNull(e.academic_year),
      ca1_score:            parseNum(e.ca1_score) ?? 0,
      ca2_score:            parseNum(e.ca2_score) ?? 0,
      ca3_score:            parseNum(e.ca3_score) ?? 0,
      continuous_assessment: parseNum(e.continuous_assessment) ?? 0,
      exam_score:           parseNum(e.exam_score) ?? 0,
      total_score:          parseNum(e.total_score) ?? 0,
      grade:                orNull(e.grade),
      remarks:              orNull(e.remarks),
      lt_cum:               parseNum(e.lt_cum) ?? 0,
      cumulative_average:   parseNum(e.cumulative_average) ?? 0,
      position:             orNull(e.position),
      results_released:     parseBool(e.results_released) ?? false,
      created_date:         parseTS(e.created_date),
    });
  }
  const { ok: exOk, fail: exFail } = await batchInsert('exam_results', examRecs);
  console.log(`  ✅ ${exOk} imported, ${exFail} failed, ${exSkip} skipped\n`);

  // ══ 9. CBT ATTEMPTS ════════════════════════════════════════════════════════
  console.log('🖥️  Migrating CBT attempts...');
  const cbtRows = readCSV('CBTAttempt_export.csv');
  let cbtOk = 0, cbtFail = 0, cbtSkip = 0;
  for (const a of cbtRows) {
    const newStudentId = studentMap[a.student_id];
    const newQuizId    = quizMap[a.quiz_id];
    if (!newStudentId || !newQuizId) { cbtSkip++; continue; }
    const rec = {
      student_id:       newStudentId,
      quiz_id:          newQuizId,
      score:            parseNum(a.score) ?? 0,
      total_questions:  parseNum(a.total_questions) ?? 0,
      started_at:       parseTS(a.started_at),
      completed_at:     parseTS(a.completed_at),
      submitted_answers: parseJSON(a.submitted_answers),
      grading_status:   orNull(a.grading_status) ?? 'pending',
      essay_scores:     parseJSON(a.essay_scores),
      teacher_comments: parseJSON(a.teacher_comments),
      status:           orNull(a.status) ?? 'submitted',
      created_date:     parseTS(a.created_date),
    };
    const { error } = await supabase.from('cbt_attempts').insert(rec);
    if (error) { console.error(`  ❌ CBTAttempt:`, error.message); cbtFail++; }
    else cbtOk++;
  }
  console.log(`  ✅ ${cbtOk} imported, ${cbtFail} failed, ${cbtSkip} skipped\n`);

  // ══ 10. CLASS ASSIGNMENTS ══════════════════════════════════════════════════
  console.log('📋 Migrating class assignments...');
  const caRows = readCSV('ClassAssignment_export.csv');
  const caRecs = [];
  let caSkip = 0;
  for (const c of caRows) {
    const newTeacherId = teacherMap[c.subject_teacher_id];
    if (!newTeacherId) { caSkip++; continue; }
    caRecs.push({
      grade:              orNull(c.grade) ?? '',
      subject:            orNull(c.subject) ?? '',
      subject_teacher_id: newTeacherId,
      periods_per_week:   parseNum(c.periods_per_week) ?? 4,
      created_date:       parseTS(c.created_date),
    });
  }
  const { ok: caOk, fail: caFail } = await batchInsert('class_assignments', caRecs);
  console.log(`  ✅ ${caOk} imported, ${caFail} failed, ${caSkip} skipped\n`);

  // ══ 11. TIMETABLE SLOTS ════════════════════════════════════════════════════
  console.log('📆 Migrating timetable slots...');
  const ttRows = readCSV('TimetableSlot_export.csv');
  const ttRecs = [];
  for (const t of ttRows) {
    const newTeacherId = teacherMap[t.teacher_id] || null;
    ttRecs.push({
      grade:         orNull(t.grade) ?? '',
      day:           orNull(t.day)   ?? '',
      period:        parseNum(t.period),
      subject:       orNull(t.subject_name) || orNull(t.subject),
      teacher_id:    newTeacherId,
      term:          orNull(t.term),
      academic_year: orNull(t.academic_year),
      is_blocked:    parseBool(t.is_blocked) ?? false,
      is_locked:     parseBool(t.is_locked)  ?? false,
      created_date:  parseTS(t.created_date),
    });
  }
  const { ok: ttOk, fail: ttFail } = await batchInsert('timetable_slots', ttRecs);
  console.log(`  ✅ ${ttOk} imported, ${ttFail} failed\n`);

  // ══ Summary ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════');
  console.log('🎉 Migration complete!');
  console.log(`   Teachers mapped:  ${Object.keys(teacherMap).length}`);
  console.log(`   Students mapped:  ${Object.keys(studentMap).length}`);
  console.log(`   Quizzes mapped:   ${Object.keys(quizMap).length}`);
  console.log('═══════════════════════════════════════\n');
  console.log('⚠️  Note: CBT attempt submitted_answers contain old question IDs.');
  console.log('   The scores are correct but detailed answer breakdowns may not display.');
  console.log('   This only affects previously completed tests — new tests will work fine.\n');
}

main().catch(err => { console.error('💥 Fatal error:', err); process.exit(1); });
