import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GraduationCap, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const statusColors = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  inactive: "bg-slate-100 text-slate-800 border-slate-200",
  graduated: "bg-blue-100 text-blue-800 border-blue-200",
  transferred: "bg-orange-100 text-orange-800 border-orange-200"
};

export default function RecentStudents({ students, isLoading }) {
  if (isLoading) {
    return (
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            Recent Students
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <GraduationCap className="w-5 h-5" />
          Recent Students
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {students.map((student, index) => (
          <motion.div
            key={student.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50/50 transition-colors duration-200"
          >
            <Avatar className="w-12 h-12 border-2 border-white shadow-md">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
                {student.first_name?.[0]}{student.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">
                {student.first_name} {student.last_name}
              </p>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="font-medium">{student.grade}</span>
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>{student.parent_phone}</span>
                </div>
              </div>
            </div>
            <Badge className={`${statusColors[student.enrollment_status]} border font-medium`}>
              {student.enrollment_status}
            </Badge>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}