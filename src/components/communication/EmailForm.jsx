import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Student } from "@/entities/Student";
import { sendBulkEmail } from "@/functions/sendBulkEmail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, X, Send, Loader2, CheckCircle, AlertCircle } from "lucide-react";

const GRADES = [
  "All Parents", "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

export default function EmailForm({ onCancel }) {
  const [targetGrade, setTargetGrade] = useState("All Parents");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [recipientCount, setRecipientCount] = useState(0);

  useEffect(() => {
    const fetchRecipientCount = async () => {
      let filter = { enrollment_status: 'active' };
      if (targetGrade !== "All Parents") {
        filter.grade = targetGrade;
      }
      const students = await Student.filter(filter);
      const emails = new Set(students.map(s => s.parent_email).filter(Boolean));
      setRecipientCount(emails.size);
    };
    fetchRecipientCount();
  }, [targetGrade]);

  const handleSend = async () => {
    if (!subject || !body) {
      setError("Subject and message body cannot be empty.");
      return;
    }
    
    setIsSending(true);
    setError(null);
    setResult(null);

    try {
      let filter = { enrollment_status: 'active' };
      if (targetGrade !== "All Parents") {
        filter.grade = targetGrade;
      }
      const students = await Student.filter(filter);
      const emails = [...new Set(students.map(s => s.parent_email).filter(Boolean))];

      if (emails.length === 0) {
        throw new Error("No recipients with valid email addresses found for the selected group.");
      }

      const response = await sendBulkEmail({ emails, subject, body });

      if (response.data.success) {
        setResult(response.data);
      } else {
        throw new Error(response.data.details || "Failed to send emails.");
      }
    } catch (e) {
      setError(e.message);
      console.error(e);
    } finally {
      setIsSending(false);
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
              <Mail className="w-5 h-5" />
              Send Bulk Email to Parents
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recipient Group</Label>
                <Select value={targetGrade} onValueChange={setTargetGrade}>
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map(grade => (
                      <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <p className="text-sm text-slate-600">
                  <span className="font-bold">{recipientCount}</span> recipients found.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="E.g., Important School Announcement"
                className="bg-slate-50/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-body">Message</Label>
              <Textarea
                id="email-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your message here. You can use HTML for formatting."
                className="bg-slate-50/50 h-40"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/60">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button onClick={handleSend} disabled={isSending || recipientCount === 0}>
                {isSending ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {isSending ? "Sending..." : `Send Email`}
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
            <div className="mt-4 p-3 bg-green-50 text-green-800 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <p className="text-sm font-medium">{result.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}