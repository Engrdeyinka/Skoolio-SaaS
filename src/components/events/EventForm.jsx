import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, X, Save } from "lucide-react";
import { getLagosDateString } from "@/lib/timezone";

const EVENT_TYPES = [
  { value: "academic", label: "Academic" },
  { value: "sports", label: "Sports" },
  { value: "cultural", label: "Cultural" },
  { value: "meeting", label: "Meeting" },
  { value: "holiday", label: "Holiday" },
  { value: "examination", label: "Examination" },
  { value: "other", label: "Other" }
];

const TARGET_AUDIENCE = [
  { value: "all", label: "All" },
  { value: "students", label: "Students Only" },
  { value: "parents", label: "Parents Only" },
  { value: "teachers", label: "Teachers Only" },
  { value: "staff", label: "Staff Only" },
  { value: "specific_class", label: "Specific Class" }
];

const EVENT_STATUS = [
  { value: "planned", label: "Planned" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" }
];

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

export default function EventForm({ event, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    event_title: event?.event_title || "",
    event_description: event?.event_description || "",
    event_date: event?.event_date || getLagosDateString(),
    event_time: event?.event_time || "",
    event_type: event?.event_type || "academic",
    target_audience: event?.target_audience || "all",
    specific_class: event?.specific_class || "",
    venue: event?.venue || "",
    organizer: event?.organizer || "",
    status: event?.status || "planned"
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSubmit(formData);
    setIsSubmitting(false);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              {event ? "Edit Event" : "Create New Event"}
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="event_title">Event Title *</Label>
                <Input
                  id="event_title"
                  value={formData.event_title}
                  onChange={(e) => handleChange('event_title', e.target.value)}
                  required
                  className="bg-slate-50/50"
                  placeholder="Enter event title"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Event Type *</Label>
                <Select
                  value={formData.event_type}
                  onValueChange={(value) => handleChange('event_type', value)}
                  required
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="event_date">Event Date *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => handleChange('event_date', e.target.value)}
                  required
                  className="bg-slate-50/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="event_time">Event Time</Label>
                <Input
                  id="event_time"
                  value={formData.event_time}
                  onChange={(e) => handleChange('event_time', e.target.value)}
                  className="bg-slate-50/50"
                  placeholder="e.g., 10:00 AM - 2:00 PM"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Target Audience *</Label>
                <Select
                  value={formData.target_audience}
                  onValueChange={(value) => handleChange('target_audience', value)}
                  required
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_AUDIENCE.map((audience) => (
                      <SelectItem key={audience.value} value={audience.value}>
                        {audience.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {formData.target_audience === 'specific_class' && (
                <div className="space-y-2">
                  <Label>Specific Class</Label>
                  <Select
                    value={formData.specific_class}
                    onValueChange={(value) => handleChange('specific_class', value)}
                  >
                    <SelectTrigger className="bg-slate-50/50">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  value={formData.venue}
                  onChange={(e) => handleChange('venue', e.target.value)}
                  className="bg-slate-50/50"
                  placeholder="Event location"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="organizer">Organizer</Label>
                <Input
                  id="organizer"
                  value={formData.organizer}
                  onChange={(e) => handleChange('organizer', e.target.value)}
                  className="bg-slate-50/50"
                  placeholder="Event organizer"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange('status', value)}
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="event_description">Event Description</Label>
              <Textarea
                id="event_description"
                value={formData.event_description}
                onChange={(e) => handleChange('event_description', e.target.value)}
                placeholder="Detailed description of the event..."
                className="bg-slate-50/50 h-32"
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/60">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 shadow-lg"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? "Saving..." : event ? "Update Event" : "Create Event"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
