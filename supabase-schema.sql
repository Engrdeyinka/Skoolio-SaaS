-- ============================================
-- TUNMISEAPP SUPABASE SCHEMA
-- ============================================

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  school_role TEXT CHECK (school_role IN ('super_admin', 'admin', 'teacher', 'student')),
  linked_student_id TEXT,
  linked_teacher_id TEXT,
  current_term TEXT DEFAULT 'Third Term',
  current_academic_year TEXT DEFAULT '2025/2026',
  preview_student_id TEXT,
  preview_student_name TEXT,
  preview_student_grade TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  grade TEXT NOT NULL,
  enrollment_status TEXT DEFAULT 'active',
  enrollment_date DATE DEFAULT CURRENT_DATE,
  start_term TEXT DEFAULT 'Second Term',
  start_academic_year TEXT DEFAULT '2025/2026',
  parent_name TEXT DEFAULT '',
  parent_phone TEXT DEFAULT '',
  parent_email TEXT,
  address TEXT,
  termly_tuition NUMERIC DEFAULT 0,
  state_of_origin TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Teachers
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject_specialization TEXT,
  qualification TEXT,
  employment_date DATE,
  employment_status TEXT DEFAULT 'active',
  classes_assigned TEXT[],
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  amount NUMERIC DEFAULT 0,
  payment_date DATE,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  term TEXT,
  academic_year TEXT,
  notes TEXT,
  due_date DATE,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Attendance
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  attendance_date DATE,
  status TEXT,
  grade TEXT,
  term TEXT,
  academic_year TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_title TEXT NOT NULL,
  event_description TEXT,
  event_date DATE,
  event_type TEXT,
  location TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  vendor_name TEXT,
  amount NUMERIC DEFAULT 0,
  expense_date DATE,
  expense_type TEXT,
  payment_method TEXT,
  approved_by TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Exam Results
CREATE TABLE exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_name TEXT,
  term TEXT,
  academic_year TEXT,
  ca1_score NUMERIC DEFAULT 0,
  ca2_score NUMERIC DEFAULT 0,
  ca3_score NUMERIC DEFAULT 0,
  continuous_assessment NUMERIC DEFAULT 0,
  exam_score NUMERIC DEFAULT 0,
  total_score NUMERIC DEFAULT 0,
  grade TEXT,
  remarks TEXT,
  lt_cum NUMERIC DEFAULT 0,
  cumulative_average NUMERIC DEFAULT 0,
  position TEXT,
  results_released BOOLEAN DEFAULT false,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Quizzes
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  subject TEXT,
  grade TEXT,
  term TEXT,
  academic_year TEXT,
  test_type TEXT,
  duration_minutes INT DEFAULT 30,
  status TEXT DEFAULT 'draft',
  is_published BOOLEAN DEFAULT true,
  results_visible BOOLEAN DEFAULT true,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  text TEXT,
  question_type TEXT DEFAULT 'mcq',
  options JSONB,
  correct_option_index INT,
  marks NUMERIC DEFAULT 1,
  image_url TEXT,
  explanation TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- CBT Attempts
CREATE TABLE cbt_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  score NUMERIC DEFAULT 0,
  total_questions INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  submitted_answers JSONB,
  grading_status TEXT DEFAULT 'pending',
  essay_scores JSONB DEFAULT '{}',
  teacher_comments JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Class Assignments
CREATE TABLE class_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT,
  subject TEXT,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  subject_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  periods_per_week INT DEFAULT 4,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Timetable Slots
CREATE TABLE timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT,
  day TEXT,
  period INT,
  subject TEXT,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  term TEXT,
  academic_year TEXT,
  is_blocked BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Subjects
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_name TEXT NOT NULL,
  grade_levels TEXT[],
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Teacher Availability
CREATE TABLE teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  day TEXT,
  periods_available INT[],
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Academic Records
CREATE TABLE academic_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID,
  term TEXT,
  academic_year TEXT,
  continuous_assessment NUMERIC DEFAULT 0,
  exam_score NUMERIC DEFAULT 0,
  total_score NUMERIC DEFAULT 0,
  grade TEXT,
  remarks TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Class Fees (term/year scoped fee schedule)
CREATE TABLE class_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL,
  term TEXT,
  academic_year TEXT,
  termly_tuition NUMERIC DEFAULT 0,
  other_fees JSONB DEFAULT '[]',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX class_fees_scope_unique
  ON class_fees (grade, COALESCE(term, ''), COALESCE(academic_year, ''));

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_date
CREATE OR REPLACE FUNCTION update_updated_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_date = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_date BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON exam_results FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON cbt_attempts FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON class_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON timetable_slots FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON teacher_availability FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON academic_records FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE TRIGGER set_updated_date BEFORE UPDATE ON class_fees FOR EACH ROW EXECUTE FUNCTION update_updated_date();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cbt_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_fees ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT school_role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

-- Students
CREATE POLICY "students_admin_all" ON students FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "students_teacher_select" ON students FOR SELECT USING (get_user_role() = 'teacher');
CREATE POLICY "students_student_select" ON students FOR SELECT USING (get_user_role() = 'student');
CREATE POLICY "students_student_insert" ON students FOR INSERT WITH CHECK (get_user_role() = 'student');

-- Teachers
CREATE POLICY "teachers_admin_all" ON teachers FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "teachers_read" ON teachers FOR SELECT USING (true);

-- Payments
CREATE POLICY "payments_admin_all" ON payments FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "payments_read" ON payments FOR SELECT USING (true);

-- Events
CREATE POLICY "events_admin_all" ON events FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "events_read" ON events FOR SELECT USING (true);

-- Expenses
CREATE POLICY "expenses_admin_all" ON expenses FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));

-- Quizzes
CREATE POLICY "quizzes_write" ON quizzes FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "quizzes_read" ON quizzes FOR SELECT USING (true);

-- Questions
CREATE POLICY "questions_write" ON questions FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "questions_read" ON questions FOR SELECT USING (true);

-- CBT Attempts
CREATE POLICY "cbt_attempts_write" ON cbt_attempts FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "cbt_attempts_read" ON cbt_attempts FOR SELECT USING (true);
CREATE POLICY "cbt_attempts_student_insert" ON cbt_attempts FOR INSERT WITH CHECK (get_user_role() = 'student');
CREATE POLICY "cbt_attempts_student_update" ON cbt_attempts FOR UPDATE USING (get_user_role() = 'student');

-- Exam Results
CREATE POLICY "exam_results_write" ON exam_results FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "exam_results_read" ON exam_results FOR SELECT USING (true);

-- Attendance
CREATE POLICY "attendance_write" ON attendance FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "attendance_read" ON attendance FOR SELECT USING (true);

-- Class Assignments
CREATE POLICY "class_assignments_write" ON class_assignments FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "class_assignments_read" ON class_assignments FOR SELECT USING (true);

-- Timetable Slots
CREATE POLICY "timetable_slots_write" ON timetable_slots FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "timetable_slots_read" ON timetable_slots FOR SELECT USING (true);

-- Subjects
CREATE POLICY "subjects_write" ON subjects FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "subjects_read" ON subjects FOR SELECT USING (true);

-- Teacher Availability
CREATE POLICY "teacher_availability_write" ON teacher_availability FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "teacher_availability_read" ON teacher_availability FOR SELECT USING (true);

-- Academic Records
CREATE POLICY "academic_records_write" ON academic_records FOR ALL USING (get_user_role() IN ('admin', 'super_admin', 'teacher'));
CREATE POLICY "academic_records_read" ON academic_records FOR SELECT USING (true);

-- Class Fees
CREATE POLICY "class_fees_write" ON class_fees FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY "class_fees_read" ON class_fees FOR SELECT USING (true);
