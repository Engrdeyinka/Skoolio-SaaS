import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { paymentId } = await req.json();
        
        if (!paymentId) {
            return Response.json({ error: 'Payment ID is required' }, { status: 400 });
        }

        // Get payment details
        const payment = await base44.entities.Payment.get(paymentId);
        
        if (!payment) {
            return Response.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Get student details with error handling
        let student = null;
        try {
            student = await base44.entities.Student.get(payment.student_id);
        } catch (error) {
            console.error('Error fetching student:', error);
            return Response.json({ 
                error: `Student record not found for payment. Student ID: ${payment.student_id}` 
            }, { status: 404 });
        }

        if (!student) {
            return Response.json({ 
                error: `Student record not found for payment. Student ID: ${payment.student_id}` 
            }, { status: 404 });
        }

        // Create PDF receipt
        const doc = new jsPDF();
        
        // School Header
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('TUNMISE OVERCOMER PRIVATE SCHOOL', 105, 25, { align: 'center' });
        
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.text('Osun State, Nigeria', 105, 33, { align: 'center' });

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('PAYMENT RECEIPT', 105, 45, { align: 'center' });
        
        // Receipt details box
        doc.setDrawColor(0);
        doc.rect(20, 60, 170, 110);
        
        // Receipt info
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Receipt No:', 25, 75);
        doc.setFont(undefined, 'normal');
        doc.text(`RC-${payment.id.substring(0, 8).toUpperCase()}`, 70, 75);
        
        doc.setFont(undefined, 'bold');
        doc.text('Date:', 120, 75);
        doc.setFont(undefined, 'normal');
        doc.text(new Date(payment.payment_date || new Date()).toLocaleDateString(), 140, 75);
        
        // Student details
        doc.setFont(undefined, 'bold');
        doc.text('Student Name:', 25, 90);
        doc.setFont(undefined, 'normal');
        doc.text(`${student.first_name || ''} ${student.last_name || ''}`, 70, 90);
        
        doc.setFont(undefined, 'bold');
        doc.text('Class:', 120, 90);
        doc.setFont(undefined, 'normal');
        doc.text(student.grade || 'N/A', 140, 90);
        
        doc.setFont(undefined, 'bold');
        doc.text('Parent/Guardian:', 25, 105);
        doc.setFont(undefined, 'normal');
        doc.text(student.parent_name || 'N/A', 70, 105);
        
        // Payment details
        doc.setFont(undefined, 'bold');
        doc.text('Payment For:', 25, 120);
        doc.setFont(undefined, 'normal');
        doc.text(`${payment.term || 'N/A'} ${payment.academic_year || ''}`, 70, 120);
        
        doc.setFont(undefined, 'bold');
        doc.text('Amount Paid:', 25, 135);
        doc.setFont(undefined, 'normal');
        doc.text(`₦${(payment.amount || 0).toLocaleString()}`, 70, 135);
        
        doc.setFont(undefined, 'bold');
        doc.text('Payment Method:', 120, 135);
        doc.setFont(undefined, 'normal');
        doc.text((payment.payment_method || 'cash').replace('_', ' ').toUpperCase(), 160, 135);
        
        doc.setFont(undefined, 'bold');
        doc.text('Payment Status:', 25, 150);
        doc.setFont(undefined, 'normal');
        doc.text((payment.payment_status || 'paid').toUpperCase(), 70, 150);
        
        // Notes if any
        if (payment.notes) {
            doc.setFont(undefined, 'bold');
            doc.text('Notes:', 25, 180);
            doc.setFont(undefined, 'normal');
            const splitNotes = doc.splitTextToSize(payment.notes, 160);
            doc.text(splitNotes, 25, 190);
        }
        
        // Footer
        doc.setFontSize(8);
        doc.text('Thank you for your payment. Keep this receipt for your records.', 105, 240, { align: 'center' });
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 250, { align: 'center' });
        
        // Signature line
        doc.line(120, 220, 180, 220);
        doc.text('Authorized Signature', 150, 230, { align: 'center' });

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=receipt-${payment.id.substring(0, 8)}.pdf`
            }
        });
    } catch (error) {
        console.error('Receipt generation error:', error);
        return Response.json({ 
            error: 'Failed to generate receipt', 
            details: error.message 
        }, { status: 500 });
    }
});