import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { students } = await req.json();
        
        if (!students || !Array.isArray(students) || students.length === 0) {
            return Response.json({ error: 'Students array is required' }, { status: 400 });
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < students.length; i++) {
            const studentData = students[i];
            
            try {
                // Validate required fields
                if (!studentData.first_name || !studentData.last_name || !studentData.grade || 
                    !studentData.parent_name || !studentData.parent_phone) {
                    errors.push({
                        row: i + 1,
                        error: 'Missing required fields: first_name, last_name, grade, parent_name, parent_phone'
                    });
                    continue;
                }

                // Set defaults
                const completeStudentData = {
                    ...studentData,
                    enrollment_status: studentData.enrollment_status || 'active',
                    enrollment_date: studentData.enrollment_date || new Date().toISOString().split('T')[0],
                    termly_tuition: parseFloat(studentData.termly_tuition) || 0
                };

                const createdStudent = await base44.entities.Student.create(completeStudentData);
                results.push({
                    row: i + 1,
                    success: true,
                    student_id: createdStudent.id,
                    name: `${studentData.first_name} ${studentData.last_name}`
                });
            } catch (error) {
                errors.push({
                    row: i + 1,
                    error: error.message,
                    data: studentData
                });
            }
        }

        return Response.json({
            success: true,
            total_processed: students.length,
            successful_imports: results.length,
            failed_imports: errors.length,
            results,
            errors
        });

    } catch (error) {
        console.error('Bulk import error:', error);
        return Response.json({ 
            error: 'Failed to import students', 
            details: error.message 
        }, { status: 500 });
    }
});