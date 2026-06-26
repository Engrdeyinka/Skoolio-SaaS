import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GRADE_PROGRESSION = {
  "KG 1": "KG 2",
  "KG 2": "Nursery 1",
  "Nursery 1": "Nursery 2",
  "Nursery 2": "Primary 1",
  "Primary 1": "Primary 2",
  "Primary 2": "Primary 3",
  "Primary 3": "Primary 4",
  "Primary 4": "Primary 5",
  "Primary 5": "JSS 1",
  "JSS 1": "JSS 2",
  "JSS 2": "JSS 3",
  "JSS 3": "SSS 1",
  "SSS 1": "SSS 2",
  "SSS 2": "SSS 3",
  "SSS 3": "SSS 3",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { currentTerm, currentYear, nextTerm, nextYear } = await req.json();

    // Fetch all active students
    const students = await base44.entities.Student.filter({ enrollment_status: "active" });

    // Fetch all academic records for current term
    const academicRecords = await base44.entities.AcademicRecord.filter({
      term: currentTerm,
      academic_year: currentYear,
    });

    // Fetch all payments for current term
    const payments = await base44.entities.Payment.filter({
      term: currentTerm,
      academic_year: currentYear,
    });

    // Process students: promote them to next grade
    const updatedStudents = [];
    for (const student of students) {
      const nextGrade = GRADE_PROGRESSION[student.grade] || student.grade;
      await base44.asServiceRole.entities.Student.update(student.id, { grade: nextGrade });
      updatedStudents.push({ ...student, grade: nextGrade });
    }

    // Copy academic records to next term
    const newAcademicRecords = academicRecords.map(record => ({
      student_id: record.student_id,
      subject_id: record.subject_id,
      term: nextTerm,
      academic_year: nextYear,
      continuous_assessment: 0,
      exam_score: 0,
      total_score: 0,
      grade: "",
      remarks: "",
    }));

    if (newAcademicRecords.length > 0) {
      await base44.asServiceRole.entities.AcademicRecord.bulkCreate(newAcademicRecords);
    }

    // Copy payments to next term (reset status to pending)
    const newPayments = payments.map(payment => ({
      student_id: payment.student_id,
      amount: payment.amount,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: payment.payment_method,
      payment_status: "pending",
      term: nextTerm,
      academic_year: nextYear,
      notes: `Transferred from ${currentTerm} ${currentYear}`,
      due_date: payment.due_date,
    }));

    if (newPayments.length > 0) {
      await base44.asServiceRole.entities.Payment.bulkCreate(newPayments);
    }

    return Response.json({
      success: true,
      studentsProcessed: students.length,
      recordsTransferred: newAcademicRecords.length,
      paymentsTransferred: newPayments.length,
    });
  } catch (error) {
    console.error("Transfer error:", error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});