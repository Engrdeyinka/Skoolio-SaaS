import React, { useState } from "react";
import { motion } from "framer-motion";
import { bulkImportStudents } from "@/functions/bulkImportStudents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Save, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header = "") {
  return String(header).replace(/^\uFEFF/, "").trim().toLowerCase();
}

function parseStudentsFromCsv(text) {
  const rows = parseCsvText(text);
  if (!rows.length) throw new Error("The CSV file is empty.");

  const headers = rows[0].map(normalizeHeader);
  const requiredHeaders = ["first_name", "last_name", "grade", "parent_name", "parent_phone"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required column(s): ${missingHeaders.join(", ")}`);
  }

  return rows
    .slice(1)
    .map((cells, index) => {
      const record = {};
      headers.forEach((header, cellIndex) => {
        record[header] = (cells[cellIndex] || "").trim();
      });

      return {
        ...record,
        termly_tuition: record.termly_tuition ? Number(record.termly_tuition) || 0 : 0,
        _rowNumber: index + 2,
      };
    })
    .filter((record) => Object.values(record).some((value) => String(value || "").trim() !== ""));
}

export default function BulkImportForm({
  onCancel,
  onImportSuccess,
  currentUser,
  isSuperAdminUser,
  classFees = [],
  term,
  academicYear,
}) {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = "first_name,last_name,grade,parent_name,parent_phone,termly_tuition,date_of_birth,enrollment_status,enrollment_date,parent_email,address,state_of_origin";
    const example = "John,Doe,JSS 1,Jane Doe,+2348012345678,150000,2010-05-15,active,2024-09-01,jane.doe@email.com,\"123 Main St, Lagos\",Lagos";
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${example}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "student_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async () => {
    if (!file) {
      setError("Please select a file to import.");
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const csvText = await file.text();
      const parsedStudents = parseStudentsFromCsv(csvText);
      if (!parsedStudents.length) {
        throw new Error("No student rows were found in the CSV file.");
      }

      const importResponse = await bulkImportStudents({
        students: parsedStudents,
        currentUser,
        isSuperAdminUser,
        classFees,
        term,
        academicYear,
      });
      
      if (importResponse.data.success) {
        setResult(importResponse.data);
        onImportSuccess(); // Refresh the student list on the main page
      } else {
        throw new Error(importResponse.data.details || importResponse.data.message || "An unknown error occurred during import.");
      }

    } catch (e) {
      setError(e.message);
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-8"
    >
      <Card className="bg-white/90 backdrop-blur-xl shadow-xl border border-slate-200/60">
        <CardHeader className="border-b border-slate-200/60">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800">
              <Upload className="w-5 h-5" />
              Bulk Import Students
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Upload a CSV file with student data. Ensure the column headers match the template.
            </p>
            <Button variant="link" onClick={handleDownloadTemplate} className="p-0 h-auto">
              Download CSV Template
            </Button>
            
            <div className="space-y-2">
              <Label htmlFor="student-csv">CSV File</Label>
              <Input id="student-csv" type="file" accept=".csv" onChange={handleFileChange} className="bg-slate-50/50" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/60">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button onClick={handleImport} disabled={isProcessing || !file}>
                {isProcessing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {isProcessing ? "Processing..." : "Import Students"}
              </Button>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-4 space-y-3">
              <h4 className="font-semibold">Import Summary</h4>
              <div className="p-3 bg-green-50 text-green-800 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <p className="text-sm font-medium">
                  Successfully imported {result.successful_imports} of {result.total_processed} students.
                </p>
              </div>
              {result.pending_approvals > 0 && (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                  {result.pending_approvals} student record{result.pending_approvals !== 1 ? "s" : ""} sent for superadmin approval.
                </div>
              )}
              {result.failed_imports > 0 && (
                <div className="p-3 bg-red-50 text-red-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm font-medium">{result.failed_imports} rows failed to import.</p>
                  </div>
                  <ul className="list-disc pl-6 mt-2 text-xs space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <li key={i}>Row {err.row}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
