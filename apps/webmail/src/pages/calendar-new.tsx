import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Upload,
  Clock,
  MapPin,
  Users,
  Bell,
  Trash2,
  Edit,
  MoreHorizontal,
  Settings,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Types
interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  attendees: EventAttendee[];
  reminders: EventReminder[];
  timezone: string;
  color: string;
  calendar: string;
  created: Date;
  updated: Date;
  organizer: { name: string; email: string };
}

interface EventAttendee {
  name: string;
  email: string;
  status: "pending" | "accepted" | "declined" | "tentative";
  required: boolean;
}

interface EventReminder {
  id: string;
  minutes: number;
  type: "popup" | "email";
}

type ViewMode = "month" | "week" | "day";

const EVENT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // yellow
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export function CalendarPage() {
  const { toast } = useToast();

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    date: Date;
  } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Helper functions
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const navigateDate = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") {
      newDate.setMonth(
        currentDate.getMonth() + (direction === "next" ? 1 : -1),
      );
    } else if (viewMode === "week") {
      newDate.setDate(currentDate.getDate() + (direction === "next" ? 7 : -7));
    } else {
      newDate.setDate(currentDate.getDate() + (direction === "next" ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  const getDayEvents = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const handleCreateEvent = (date?: Date) => {
    // Placeholder for event creation
    console.log("Creating event for", date || currentDate);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    // Placeholder for event editing
    console.log("Editing event", event);
  };

  const handleDeleteEvent = (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    toast({
      title: "Event deleted",
      description: "The event has been removed from your calendar.",
    });
  };

  const handleExportCalendar = () => {
    // Simple export functionality
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Your App//Calendar//EN
${events
  .map(
    (event) => `BEGIN:VEVENT
UID:${event.id}
DTSTART:${event.start.toISOString().replace(/[-:]/g, "").split(".")[0]}Z
DTEND:${event.end.toISOString().replace(/[-:]/g, "").split(".")[0]}Z
SUMMARY:${event.title}
DESCRIPTION:${event.description || ""}
LOCATION:${event.location || ""}
END:VEVENT`,
  )
  .join("\n")}
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMouseDown = (e: React.MouseEvent, date: Date) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      date: new Date(date),
    });
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart) {
      // Handle drag creation logic here
      console.log("Drag ended");
    }
    setIsDragging(false);
    setDragStart(null);
  };

  const generateCalendarGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const current = new Date(startDate);

    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  };

  const formatDisplayDate = () => {
    if (viewMode === "month") {
      return currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } else if (viewMode === "week") {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return `${weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
    } else {
      return currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Calendar</h1>
          <Button onClick={goToToday} variant="outline" size="sm">
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigateDate("prev")}
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[200px] text-center font-medium">
              {formatDisplayDate()}
            </div>
            <Button
              onClick={() => navigateDate("next")}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* View Mode */}
          <Select
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCalendar}>
                <Download className="mr-2 h-4 w-4" />
                Export Calendar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Calendar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Calendar Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={() => handleCreateEvent()} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Mini Calendar Sidebar */}
        <div className="w-80 border-r p-4 space-y-4">
          {/* Mini Month View */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {currentDate.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="grid grid-cols-7 gap-1 text-xs">
                {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                  <div
                    key={day}
                    className="text-center p-1 font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
                {generateCalendarGrid().map((date, i) => {
                  const isCurrentMonth =
                    date.getMonth() === currentDate.getMonth();
                  const isToday =
                    date.toDateString() === new Date().toDateString();
                  const hasEvents = getDayEvents(date).length > 0;

                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentDate(new Date(date))}
                      className={`
                        aspect-square p-1 text-xs rounded hover:bg-muted transition-colors
                        ${!isCurrentMonth ? "text-muted-foreground" : ""}
                        ${isToday ? "bg-primary text-primary-foreground" : ""}
                        ${hasEvents ? "font-bold" : ""}
                      `}
                    >
                      {date.getDate()}
                      {hasEvents && (
                        <div className="w-1 h-1 bg-current rounded-full mx-auto mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-2">
              {events
                .filter((event) => event.start >= new Date())
                .sort((a, b) => a.start.getTime() - b.start.getTime())
                .slice(0, 5)
                .map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="p-2 rounded-lg border cursor-pointer hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: event.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {event.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {event.start.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {!event.allDay &&
                            ` at ${event.start.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              {events.filter((event) => event.start >= new Date()).length ===
                0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No upcoming events
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Calendar View */}
        <div className="flex-1 flex flex-col">
          {viewMode === "month" && (
            <div
              ref={calendarRef}
              className="flex-1 grid grid-cols-7"
              onMouseUp={handleMouseUp}
            >
              {/* Week Header */}
              {[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ].map((day) => (
                <div key={day} className="border-b border-r p-2 bg-muted/30">
                  <div className="text-sm font-medium text-center">{day}</div>
                </div>
              ))}

              {/* Calendar Grid */}
              {generateCalendarGrid().map((date, i) => {
                const isCurrentMonth =
                  date.getMonth() === currentDate.getMonth();
                const isToday =
                  date.toDateString() === new Date().toDateString();
                const dayEvents = getDayEvents(date);

                return (
                  <div
                    key={i}
                    className={`
                      border-b border-r p-1 min-h-[120px] cursor-pointer hover:bg-muted/30 transition-colors
                      ${!isCurrentMonth ? "bg-muted/10 text-muted-foreground" : ""}
                      ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                    `}
                    onMouseDown={(e) => handleMouseDown(e, date)}
                  >
                    <div
                      className={`text-sm p-1 ${isToday ? "font-bold" : ""}`}
                    >
                      {date.getDate()}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                          className="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity"
                          style={{
                            backgroundColor: event.color,
                            color: "white",
                          }}
                          title={event.title}
                        >
                          {event.allDay
                            ? event.title
                            : `${event.start.toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })} ${event.title}`}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground p-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === "week" && (
            <div className="flex-1 p-4 text-center text-muted-foreground">
              Week view coming soon...
            </div>
          )}

          {viewMode === "day" && (
            <div className="flex-1 p-4 text-center text-muted-foreground">
              Day view coming soon...
            </div>
          )}
        </div>
      </div>

      {/* Event Details Dialog */}
      {selectedEvent && (
        <Dialog
          open={!!selectedEvent}
          onOpenChange={() => setSelectedEvent(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: selectedEvent.color }}
                />
                {selectedEvent.title}
              </DialogTitle>
              <DialogDescription>Event Details</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date & Time</Label>
                  <div className="text-sm">
                    {selectedEvent.allDay
                      ? `${selectedEvent.start.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })} (All day)`
                      : `${selectedEvent.start.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })} ${selectedEvent.start.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })} - ${selectedEvent.end.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Timezone</Label>
                  <div className="text-sm">{selectedEvent.timezone}</div>
                </div>
              </div>

              {selectedEvent.location && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </Label>
                  <div className="text-sm">{selectedEvent.location}</div>
                </div>
              )}

              {selectedEvent.description && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Description</Label>
                  <div className="text-sm whitespace-pre-wrap">
                    {selectedEvent.description}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  handleEditEvent(selectedEvent);
                  setSelectedEvent(null);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  handleDeleteEvent(selectedEvent.id);
                  setSelectedEvent(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Calendar</DialogTitle>
              <DialogDescription>
                Import events from an ICS file
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Input
                type="file"
                accept=".ics"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    console.log("Importing file:", file.name);
                    setShowImportDialog(false);
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Select an ICS file to import events into your calendar.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowImportDialog(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default CalendarPage;
