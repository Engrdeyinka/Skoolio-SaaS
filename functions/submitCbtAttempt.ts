import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const calculateGradeAndRemark = (total, studentClass) => {
    const isSSS = studentClass && ['SSS 1', 'SSS 2', 'SSS 3'].includes(studentClass);

    if (isSSS) {
        if (total >= 75) return { grade: "A1", remarks: "Excellent" };
        if (total >= 70) return { grade: "B2", remarks: "Very Good" };
        if (total >= 65) return { grade: "B3", remarks: "Good" };
        if (total >= 60) return { grade: "C4", remarks: "Credit" };
        if (total >= 55) return { grade: "C5", remarks: "Credit" };
        if (total >= 50) return { grade: "C6", remarks: "Credit" };
        if (total >= 45) return { grade: "D7", remarks: "Pass" };
        if (total >= 40) return { grade: "E8", remarks: "Pass" };
        return { grade: "F9", remarks: "Fail" };
    } else {
        if (total >= 70) return { grade: "A", remarks: "Excellent" };
        if (total >= 60) return { grade: "B", remarks: "Very Good" };
        if (total >= 50) return { grade: "C", remarks: "Good" };
        if (total >= 45) return { grade: "D", remarks: "Pass" };
        if (total >= 40) return { grade: "E", remarks: "Pass" };
        return { grade: "F", remarks: "Fail" };
    }
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { quizId, studentId, submittedAnswers } = await req.json();

        if (!studentId) {
            return Response.json({ error: 'Student ID is required.' }, { status: 400 });
        }

        // Get student information
        const student = await base44.asServiceRole.entities.Student.get(studentId);
        if (!student) {
            return Response.json({ error: 'Student not found.' }, { status: 404 });
        }
        const studentGrade = student.grade;

        // Use service role to get quiz and question data securely
        const quiz = await base44.asServiceRole.entities.Quiz.get(quizId);
        const questions = await base44.asServiceRole.entities.Question.filter({ quiz_id: quizId });

        if (!quiz || questions.length === 0) {
            return Response.json({ error: 'Quiz not found or has no questions.' }, { status: 404 });
        }

        // Separate MCQ and Essay questions
        const mcqQuestions = questions.filter(q => q.question_type !== 'essay');
        const essayQuestions = questions.filter(q => q.question_type === 'essay');

        // --- Grade MCQ questions only ---
        let correctCount = 0;
        mcqQuestions.forEach(q => {
            const studentAnswer = submittedAnswers[q.id];
            if (studentAnswer !== undefined && studentAnswer === q.correct_option_index) {
                correctCount++;
            }
        });

        // Calculate MCQ score as percentage
        const mcqScore = mcqQuestions.length > 0 ? (correctCount / mcqQuestions.length) * 100 : 0;
        
        // Determine grading status
        const gradingStatus = essayQuestions.length > 0 ? 'pending' : 'fully_graded';

        // --- Save the CBTAttempt ---
        const attemptData = {
            quiz_id: quizId,
            student_id: studentId,
            score: mcqScore,
            total_questions: questions.length,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            submitted_answers: submittedAnswers,
            grading_status: gradingStatus,
            essay_scores: {},
            teacher_comments: {}
        };

        const cbtAttemptRecord = await base44.asServiceRole.entities.CBTAttempt.create(attemptData);

        // --- Determine which CA field to update based on test type ---
        let academicRecordUpdatedId = null;
        if (essayQuestions.length === 0) {
            const testType = quiz.test_type;
            
            // Calculate the score based on test type max marks
            let testScore = 0;
            if (testType === 'CA1') {
                testScore = (mcqScore / 100) * 10; // Out of 10
            } else if (testType === 'CA2') {
                testScore = (mcqScore / 100) * 10; // Out of 10
            } else if (testType === 'CA3') {
                testScore = (mcqScore / 100) * 20; // Out of 20
            } else if (testType === 'Exam') {
                testScore = (mcqScore / 100) * 60; // Out of 60
            }

            const quizTerm = quiz.term || "First Term";
            const quizAcademicYear = quiz.academic_year || "2024/2025";
            
            // Find if an exam result already exists for this subject/term
            const existingResults = await base44.asServiceRole.entities.ExamResult.filter({
                student_id: studentId,
                subject_name: quiz.subject,
                term: quizTerm,
                academic_year: quizAcademicYear
            });

            let finalResultRecord;

            if (existingResults && existingResults.length > 0) {
                // Update existing record
                const resultToUpdate = existingResults[0];
                const updateData = {
                    student_id: resultToUpdate.student_id,
                    subject_name: resultToUpdate.subject_name,
                    term: resultToUpdate.term,
                    academic_year: resultToUpdate.academic_year,
                    lt_cum: resultToUpdate.lt_cum || 0,
                    cumulative_average: resultToUpdate.cumulative_average || 0,
                    position: resultToUpdate.position
                };

                // Update the appropriate field based on test type
                if (testType === 'CA1') {
                    updateData.ca1_score = testScore;
                    updateData.ca2_score = resultToUpdate.ca2_score || 0;
                    updateData.ca3_score = resultToUpdate.ca3_score || 0;
                } else if (testType === 'CA2') {
                    updateData.ca1_score = resultToUpdate.ca1_score || 0;
                    updateData.ca2_score = testScore;
                    updateData.ca3_score = resultToUpdate.ca3_score || 0;
                } else if (testType === 'CA3') {
                    updateData.ca1_score = resultToUpdate.ca1_score || 0;
                    updateData.ca2_score = resultToUpdate.ca2_score || 0;
                    updateData.ca3_score = testScore;
                } else if (testType === 'Exam') {
                    updateData.ca1_score = resultToUpdate.ca1_score || 0;
                    updateData.ca2_score = resultToUpdate.ca2_score || 0;
                    updateData.ca3_score = resultToUpdate.ca3_score || 0;
                    updateData.exam_score = testScore;
                }

                // Calculate totals
                const totalCA = (updateData.ca1_score || 0) + (updateData.ca2_score || 0) + (updateData.ca3_score || 0);
                updateData.continuous_assessment = totalCA;
                
                const examScore = testType === 'Exam' ? testScore : (resultToUpdate.exam_score || 0);
                updateData.exam_score = examScore;
                
                const total = totalCA + examScore;
                updateData.total_score = total;
                
                const { grade, remarks } = calculateGradeAndRemark(total, studentGrade);
                updateData.grade = grade;
                updateData.remarks = remarks;
                
                finalResultRecord = await base44.asServiceRole.entities.ExamResult.update(resultToUpdate.id, updateData);

            } else {
                // Create new record
                const createData = {
                    student_id: studentId,
                    subject_name: quiz.subject,
                    term: quizTerm,
                    academic_year: quizAcademicYear,
                    ca1_score: testType === 'CA1' ? testScore : 0,
                    ca2_score: testType === 'CA2' ? testScore : 0,
                    ca3_score: testType === 'CA3' ? testScore : 0,
                    exam_score: testType === 'Exam' ? testScore : 0
                };

                const totalCA = (createData.ca1_score || 0) + (createData.ca2_score || 0) + (createData.ca3_score || 0);
                createData.continuous_assessment = totalCA;
                
                const total = totalCA + createData.exam_score;
                createData.total_score = total;
                
                const { grade, remarks } = calculateGradeAndRemark(total, studentGrade);
                createData.grade = grade;
                createData.remarks = remarks;

                finalResultRecord = await base44.asServiceRole.entities.ExamResult.create(createData);
            }
            academicRecordUpdatedId = finalResultRecord.id;
        }

        return Response.json({
            message: essayQuestions.length > 0 
                ? 'Test submitted! Essay questions will be graded by your teacher.'
                : 'Test submitted and graded successfully!',
            score: mcqScore,
            cbtAttemptSaved: cbtAttemptRecord.id,
            academicRecordUpdated: academicRecordUpdatedId,
            mcqQuestionsCount: mcqQuestions.length,
            essayQuestionsCount: essayQuestions.length,
            needsManualGrading: essayQuestions.length > 0
        });

    } catch (error) {
        console.error('Error submitting CBT attempt:', error);
        return Response.json({
            error: 'An internal error occurred while submitting the test.',
            details: error.message
        }, { status: 500 });
    }
});