import React, { useState } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users,
  Edit,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const eventTypeColors = {
  academic: "bg-blue-100 text-blue-800 border-blue-200",
  sports: "bg-green-100 text-green-800 border-green-200",
  cultural: "bg-emerald-100 text-emerald-800 border-emerald-200",
  meeting: "bg-amber-100 text-amber-800 border-amber-200",
  holiday: "bg-red-100 text-red-800 border-red-200",
  examination: "bg-orange-100 text-orange-800 border-orange-200",
  other: "bg-slate-100 text-slate-800 border-slate-200"
};

const statusColors = {
  planned: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ongoing: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200"
};

export default function EventCard({ event, onEdit, onDelete }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(event);
    setIsDeleting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="bg-white/90 backdrop-blur-sm hover:shadow-xl transition-all duration-300 border border-slate-200/60 h-full">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between mb-2">
            <Badge className={`${eventTypeColors[event.event_type]} border font-medium`}>
              {event.event_type}
            </Badge>
            <Badge className={`${statusColors[event.status]} border font-medium`}>
              {event.status}
            </Badge>
          </div>
          <h3 className="font-bold text-slate-900 text-lg">
            {event.event_title}
          </h3>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{format(new Date(event.event_date), "MMM d, yyyy")}</span>
            </div>
            
            {event.event_time && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{event.event_time}</span>
              </div>
            )}
            
            {event.venue && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{event.venue}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="capitalize">{event.target_audience}</span>
              {event.specific_class && <span>- {event.specific_class}</span>}
            </div>
            
            {event.event_description && (
              <p className="text-sm text-slate-600 line-clamp-3">
                {event.event_description}
              </p>
            )}
          </div>
          
          <div className="pt-4 border-t border-slate-200/60 space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(event)}
              className="w-full hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors duration-200"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Event
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors duration-200"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeleting ? "Deleting..." : "Delete Event"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the event "{event.event_title}".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete Event
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}