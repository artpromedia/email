"use client";

/**
 * Calendar Page
 * View and manage calendar events
 */

import { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Video,
  MoreVertical,
  Edit,
  Trash2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@email/ui";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  attendees?: string[];
  color: string;
  videoLink?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

const eventColors = [
  { name: "Blue", value: "bg-blue-500" },
  { name: "Green", value: "bg-green-500" },
  { name: "Red", value: "bg-red-500" },
  { name: "Purple", value: "bg-purple-500" },
  { name: "Orange", value: "bg-orange-500" },
  { name: "Pink", value: "bg-pink-500" },
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [_loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch("/api/v1/calendar");
        const data = (await response.json()) as { events: CalendarEvent[] };
        setEvents(
          data.events.map((e: CalendarEvent) => ({
            ...e,
            start: new Date(e.start),
            end: new Date(e.end),
          }))
        );
      } catch (err) {
        setError("Failed to load calendar events");
        console.error("Failed to fetch events:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchEvents();
  }, []);

  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    location: "",
    color: "bg-blue-500",
  });

  const getDaysInMonth = (date: Date): CalendarDay[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: CalendarDay[] = [];

    // Add days from previous month
    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: false,
        events: getEventsForDate(d),
      });
    }

    // Add days of current month
    const today = new Date();
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        isCurrentMonth: true,
        isToday:
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear(),
        events: getEventsForDate(d),
      });
    }

    // Add days from next month to complete the grid
    const endPadding = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= endPadding; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: false,
        events: getEventsForDate(d),
      });
    }

    return days;
  };

  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return events.filter((event) => {
      const eventDate = new Date(event.start);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const handleAddEvent = () => {
    const dateParts = newEvent.date.split("-").map(Number);
    const startParts = newEvent.startTime.split(":").map(Number);
    const endParts = newEvent.endTime.split(":").map(Number);
    const year = dateParts[0] ?? 2024;
    const month = dateParts[1] ?? 1;
    const day = dateParts[2] ?? 1;
    const startHour = startParts[0] ?? 0;
    const startMin = startParts[1] ?? 0;
    const endHour = endParts[0] ?? 0;
    const endMin = endParts[1] ?? 0;

    const event: CalendarEvent = {
      id: Date.now().toString(),
      title: newEvent.title,
      description: newEvent.description || undefined,
      start: new Date(year, month - 1, day, startHour, startMin),
      end: new Date(year, month - 1, day, endHour, endMin),
      allDay: newEvent.allDay,
      location: newEvent.location || undefined,
      color: newEvent.color,
    };

    setEvents([...events, event]);
    setAddEventOpen(false);
    setNewEvent({
      title: "",
      description: "",
      date: "",
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      location: "",
      color: "bg-blue-500",
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    if (confirm("Are you sure you want to delete this event?")) {
      setEvents(events.filter((e) => e.id !== eventId));
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main Calendar */}
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <CalendarIcon className="h-6 w-6" />
              Calendar
            </h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[180px] text-center text-lg font-medium">{monthName}</span>
              <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border">
              {(["month", "week", "day"] as const).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView(v)}
                  className="rounded-none first:rounded-l-lg last:rounded-r-lg"
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </Button>
              ))}
            </div>
            <Dialog open={addEventOpen} onOpenChange={setAddEventOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Event
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Event</DialogTitle>
                  <DialogDescription>Create a new calendar event.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Event Title</Label>
                    <Input
                      id="title"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      placeholder="Meeting with team"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startTime">Start Time</Label>
                      <Input
                        id="startTime"
                        type="time"
                        value={newEvent.startTime}
                        onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endTime">End Time</Label>
                      <Input
                        id="endTime"
                        type="time"
                        value={newEvent.endTime}
                        onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={newEvent.location}
                      onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                      placeholder="Conference Room A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={newEvent.description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setNewEvent({ ...newEvent, description: e.target.value })
                      }
                      placeholder="Add event details..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      {eventColors.map((color) => (
                        <button
                          key={color.value}
                          className={`h-8 w-8 rounded-full ${color.value} ${
                            newEvent.color === color.value
                              ? "ring-2 ring-primary ring-offset-2"
                              : ""
                          }`}
                          onClick={() => setNewEvent({ ...newEvent, color: color.value })}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddEventOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddEvent}>Add Event</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="border-r p-2 text-center text-sm font-medium text-muted-foreground last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid h-[calc(100%-40px)] flex-1 grid-cols-7 grid-rows-6">
            {days.map((day, index) => (
              <div
                key={index}
                role="button"
                tabIndex={0}
                className={`min-h-[100px] cursor-pointer border-b border-r p-1 hover:bg-muted/50 ${
                  !day.isCurrentMonth ? "bg-muted/30" : ""
                } ${selectedDate?.getTime() === day.date.getTime() ? "bg-primary/10" : ""}`}
                onClick={() => setSelectedDate(day.date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedDate(day.date);
                }}
              >
                <div
                  className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                    day.isToday
                      ? "bg-primary text-primary-foreground"
                      : !day.isCurrentMonth
                        ? "text-muted-foreground"
                        : ""
                  }`}
                >
                  {day.date.getDate()}
                </div>
                <div className="space-y-1">
                  {day.events.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className={`truncate rounded px-1 py-0.5 text-xs text-white ${event.color}`}
                    >
                      {event.allDay ? event.title : `${formatTime(event.start)} ${event.title}`}
                    </div>
                  ))}
                  {day.events.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{day.events.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event Sidebar */}
      <div className="w-80 overflow-auto border-l p-4">
        <h2 className="mb-4 font-semibold">
          {selectedDate
            ? selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "Select a date"}
        </h2>
        {selectedDate && (
          <div className="space-y-4">
            {selectedDateEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events scheduled for this day.</p>
            ) : (
              selectedDateEvents.map((event) => (
                <Card key={event.id}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${event.color}`} />
                        <CardTitle className="text-base">{event.title}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-0">
                    {!event.allDay && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {formatTime(event.start)} - {formatTime(event.end)}
                      </div>
                    )}
                    {event.allDay && <Badge variant="secondary">All Day</Badge>}
                    {event.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </div>
                    )}
                    {event.attendees && event.attendees.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {event.attendees.length} attendee(s)
                      </div>
                    )}
                    {event.videoLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => window.open(event.videoLink, "_blank")}
                      >
                        <Video className="mr-2 h-4 w-4" />
                        Join Video Call
                      </Button>
                    )}
                    {event.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{event.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
