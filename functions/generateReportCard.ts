import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { studentId, term, academicYear } = await req.json();
        
        if (!studentId || !term || !academicYear) {
            return Response.json({ error: 'Student ID, term and academic year are required' }, { status: 400 });
        }

        // Get student details
        const student = await base44.entities.Student.get(studentId);
        if (!student) {
            return Response.json({ error: 'Student not found' }, { status: 404 });
        }

        // Get exam results for the student
        const results = await base44.entities.ExamResult.filter({
            student_id: studentId,
            term: term,
            academic_year: academicYear
        });

        // Create PDF report card
        const doc = new jsPDF();
        
        // School Header
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('TUNMISE OVERCOMER PRIVATE SCHOOL', 105, 20, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Osun State, Nigeria', 105, 28, { align: 'center' });

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('STUDENT REPORT CARD', 105, 40, { align: 'center' });
        
        // Student Info
        doc.setFontSize(10);
        doc.text(`Student Name: ${student.first_name} ${student.last_name}`, 20, 55);
        doc.text(`Class: ${student.grade}`, 20, 65);
        doc.text(`Term: ${term}`, 120, 55);
        doc.text(`Academic Year: ${academicYear}`, 120, 65);
        
        const isSecondOrThirdTerm = term === 'Second Term' || term === 'Third Term';
        
        // Results table header
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');

        if (isSecondOrThirdTerm) {
            doc.text('SUBJECT', 20, 85);
            doc.text('CA (40)', 60, 85, { align: 'center' });
            doc.text('EXAM (60)', 80, 85, { align: 'center' });
            doc.text('TOTAL', 100, 85, { align: 'center' });
            doc.text('L.T. CUM', 120, 85, { align: 'center' });
            doc.text('CUM. AVG', 145, 85, { align: 'center' });
            doc.text('GRADE', 165, 85, { align: 'center' });
            doc.text('REMARKS', 185, 85);
        } else {
            doc.text('SUBJECT', 20, 85);
            doc.text('CA (40)', 80, 85, { align: 'center' });
            doc.text('EXAM (60)', 110, 85, { align: 'center' });
            doc.text('TOTAL (100)', 140, 85, { align: 'center' });
            doc.text('GRADE', 165, 85, { align: 'center' });
            doc.text('REMARKS', 185, 85);
        }
        
        // Draw line under header
        doc.line(20, 87, 200, 87);
        
        let yPos = 95;
        let totalTermScores = 0;
        let totalCumulativeScores = 0;
        let subjectCount = results.length;
        
        // Results data
        results.forEach((result) => {
            doc.setFont(undefined, 'normal');
            doc.text(result.subject_name || 'N/A', 20, yPos);
            
            if (isSecondOrThirdTerm) {
                doc.text(String(result.continuous_assessment || 0), 60, yPos, { align: 'center' });
                doc.text(String(result.exam_score || 0), 80, yPos, { align: 'center' });
                doc.text(String(result.total_score || 0), 100, yPos, { align: 'center' });
                doc.text(String(result.lt_cum || 0), 120, yPos, { align: 'center' });
                doc.text(String(result.cumulative_average || 0), 145, yPos, { align: 'center' });
                doc.text(result.grade || 'F', 165, yPos, { align: 'center' });
                doc.text(result.remarks || '', 185, yPos);
                
                totalTermScores += result.total_score || 0;
                totalCumulativeScores += result.cumulative_average || 0;
            } else {
                doc.text(String(result.continuous_assessment || 0), 80, yPos, { align: 'center' });
                doc.text(String(result.exam_score || 0), 110, yPos, { align: 'center' });
                doc.text(String(result.total_score || 0), 140, yPos, { align: 'center' });
                doc.text(result.grade || 'F', 165, yPos, { align: 'center' });
                doc.text(result.remarks || '', 185, yPos);
                
                totalTermScores += result.total_score || 0;
            }
            
            yPos += 10;
        });
        
        // Summary
        const termAverage = subjectCount > 0 ? (totalTermScores / subjectCount).toFixed(1) : 0;
        const cumulativeAverage = isSecondOrThirdTerm && subjectCount > 0 ? (totalCumulativeScores / subjectCount).toFixed(1) : termAverage;
        
        doc.line(20, yPos, 200, yPos);
        yPos += 10;
        
        doc.setFont(undefined, 'bold');
        doc.text(`Total Subjects: ${subjectCount}`, 20, yPos);
        doc.text(`Term Average: ${termAverage}%`, 120, yPos);

        if (isSecondOrThirdTerm) {
            yPos += 10;
            doc.text(`Cumulative Average: ${cumulativeAverage}%`, 120, yPos);
        }
        
        yPos += 20;
        doc.text('Principal\'s Remarks:', 20, yPos);
        yPos += 10;
        
        let principalRemark = '';
        if (cumulativeAverage >= 70) principalRemark = 'Excellent performance. Keep it up!';
        else if (cumulativeAverage >= 60) principalRemark = 'Good performance. You can do better.';
        else if (cumulativeAverage >= 50) principalRemark = 'Fair performance. More effort needed.';
        else principalRemark = 'Poor performance. Serious improvement required.';
        
        doc.setFont(undefined, 'normal');
        doc.text(principalRemark, 20, yPos);
        
        // Signature section
        yPos += 30;
        doc.line(20, yPos, 80, yPos);
        doc.text('Class Teacher', 50, yPos + 10, { align: 'center' });
        
        doc.line(120, yPos, 180, yPos);
        doc.text('Principal', 150, yPos + 10, { align: 'center' });

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=reportcard-${student.first_name}-${term}.pdf`
            }
        });
    } catch (error) {
        console.error('Report card generation error:', error);
        return Response.json({ 
            error: 'Failed to generate report card', 
            details: error.message 
        }, { status: 500 });
    }
});