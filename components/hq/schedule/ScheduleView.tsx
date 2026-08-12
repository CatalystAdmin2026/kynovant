"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  FieldError,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  buildMonthGrid,
  endOfWeek,
  startOfWeek,
  toDateTimeLocalValue,
} from "@/lib/schedule/date";

type AppointmentCategory =
  | "consultation"
  | "check_in"
  | "training"
  | "nutrition"
  | "admin"
  | "personal"
  | "other";
type AppointmentStatus = "scheduled" | "completed" | "cancelled";
type CalendarMode = "month" | "week";

interface ScheduleClientOption {
  id: string;
  name: string;
  email: string;
}

interface Appointment {
  id: string;
  clientId: string | null;
  title: string | null;
  category: AppointmentCategory;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  privateNotes: string | null;
  clientName: string | null;
  clientEmail: string | null;
}

interface AppointmentFormState {
  id: string | null;
  clientId: string;
  title: string;
  category: AppointmentCategory;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  privateNotes: string;
}

const CATEGORY_LABEL: Record<AppointmentCategory, string> = {
  consultation: "Consultation",
  check_in: "Check-In",
  training: "Training",
  nutrition: "Nutrition",
  admin: "Admin",
  personal: "Personal",
  other: "Other",
};

const CATEGORY_STYLE: Record<AppointmentCategory, string> = {
  consultation: "border-[#C9A24D]/30 bg-[#C9A24D]/12 text-[#E4C779]",
  check_in: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  training: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  nutrition: "border-lime-400/25 bg-lime-400/10 text-lime-200",
  admin: "border-white/15 bg-white/[0.06] text-white/65",
  personal: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  other: "border-white/10 bg-white/[0.04] text-white/50",
};

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  scheduled: "border-[#C9A24D]/20 bg-[#C9A24D]/10 text-[#E4C779]",
  completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  cancelled: "border-white/10 bg-white/[0.03] text-white/35 line-through",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function eventDayKey(appointment: Appointment): string {
  return dayKey(new Date(appointment.startsAt));
}

function formatTimeRange(appointment: Appointment): string {
  const startsAt = new Date(appointment.startsAt);
  const endsAt = new Date(appointment.endsAt);
  return `${startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })} - ${endsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function appointmentLabel(appointment: Appointment): string {
  return appointment.title || appointment.clientName || CATEGORY_LABEL[appointment.category];
}

function defaultForm(start?: Date): AppointmentFormState {
  const startsAt = start ? new Date(start) : new Date();
  startsAt.setMinutes(startsAt.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (startsAt.getMinutes() === 0) startsAt.setHours(startsAt.getHours() + 1);
  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + 60);
  return {
    id: null,
    clientId: "",
    title: "",
    category: "consultation",
    status: "scheduled",
    startsAt: toDateTimeLocalValue(startsAt),
    endsAt: toDateTimeLocalValue(endsAt),
    privateNotes: "",
  };
}

function formFromAppointment(appointment: Appointment): AppointmentFormState {
  return {
    id: appointment.id,
    clientId: appointment.clientId ?? "",
    title: appointment.title ?? "",
    category: appointment.category,
    status: appointment.status,
    startsAt: toDateTimeLocalValue(new Date(appointment.startsAt)),
    endsAt: toDateTimeLocalValue(new Date(appointment.endsAt)),
    privateNotes: appointment.privateNotes ?? "",
  };
}

function payloadFromForm(form: AppointmentFormState) {
  return {
    clientId: form.clientId || null,
    title: form.title || null,
    category: form.category,
    status: form.status,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    privateNotes: form.privateNotes || null,
  };
}

export default function ScheduleView({ clients }: { clients: ScheduleClientOption[] }) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<AppointmentFormState | null>(null);

  const visibleDays = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    return buildMonthGrid(anchor);
  }, [anchor, mode]);

  const range = useMemo(() => {
    const from = new Date(visibleDays[0]);
    const to = mode === "week" ? endOfWeek(anchor) : new Date(visibleDays[visibleDays.length - 1]);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [anchor, mode, visibleDays]);

  const appointmentsByDay = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    appointments.forEach((appointment) => {
      const key = eventDayKey(appointment);
      const existing = groups.get(key) ?? [];
      existing.push(appointment);
      groups.set(key, existing);
    });
    return groups;
  }, [appointments]);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      const [scheduleRes, upcomingRes] = await Promise.all([
        fetch(`/api/internal/schedule/appointments?${query.toString()}`),
        fetch("/api/internal/schedule/appointments?upcoming=true&limit=8"),
      ]);
      const scheduleData = await scheduleRes.json();
      const upcomingData = await upcomingRes.json();
      if (!scheduleRes.ok || !scheduleData.ok) throw new Error(scheduleData.error ?? "Failed to load schedule");
      if (!upcomingRes.ok || !upcomingData.ok) throw new Error(upcomingData.error ?? "Failed to load upcoming appointments");
      setAppointments(scheduleData.appointments ?? []);
      setUpcoming(upcomingData.appointments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule]);

  function openCreate(day?: Date) {
    setFormError(null);
    setForm(defaultForm(day));
  }

  function openEdit(appointment: Appointment) {
    setFormError(null);
    setForm(formFromAppointment(appointment));
  }

  async function saveAppointment() {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = Boolean(form.id);
      const response = await fetch(
        isEdit
          ? `/api/internal/schedule/appointments/${form.id}`
          : "/api/internal/schedule/appointments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadFromForm(form)),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to save appointment");
      setForm(null);
      await fetchSchedule();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save appointment");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAppointment() {
    if (!form?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/internal/schedule/appointments/${form.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to delete appointment");
      setForm(null);
      await fetchSchedule();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to delete appointment");
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment() {
    if (!form?.id) return;
    setForm({ ...form, status: "cancelled" });
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/internal/schedule/appointments/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to cancel appointment");
      setForm(null);
      await fetchSchedule();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to cancel appointment");
    } finally {
      setSaving(false);
    }
  }

  const heading =
    mode === "week"
      ? `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`
      : monthLabel(anchor);

  return (
    <div className="space-y-6">
      <Card tone="dark" padding="md" className="border-white/[0.08]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/30">
              Native Coach Calendar
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{heading}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
              {(["month", "week"] as CalendarMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                    mode === option
                      ? "bg-[#C9A24D] text-black"
                      : "text-white/45 hover:bg-white/[0.06] hover:text-white/80"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <Button
              type="button"
              tone="dark"
              variant="secondary"
              size="sm"
              leftIcon={<ChevronLeft />}
              onClick={() => setAnchor(mode === "week" ? addDays(anchor, -7) : addMonths(anchor, -1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              tone="dark"
              variant="secondary"
              size="sm"
              onClick={() => setAnchor(new Date())}
            >
              Today
            </Button>
            <Button
              type="button"
              tone="dark"
              variant="secondary"
              size="sm"
              rightIcon={<ChevronRight />}
              onClick={() => setAnchor(mode === "week" ? addDays(anchor, 7) : addMonths(anchor, 1))}
            >
              Next
            </Button>
            <Button type="button" tone="dark" size="sm" leftIcon={<Plus />} onClick={() => openCreate()}>
              Appointment
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card tone="dark" padding="none" className="border-white/[0.08]">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-white/[0.07]">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">
                    {day}
                  </div>
                ))}
              </div>
              {error && (
                <div className="border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {loading ? (
                <div className="grid grid-cols-7">
                  {visibleDays.map((day) => (
                    <div key={dayKey(day)} className="min-h-[130px] border-b border-r border-white/[0.06] p-3">
                      <div className="h-3 w-8 rounded bg-white/[0.08]" />
                      <div className="mt-4 h-7 rounded bg-white/[0.04]" />
                      <div className="mt-2 h-7 rounded bg-white/[0.03]" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {visibleDays.map((day) => {
                    const key = dayKey(day);
                    const dayAppointments = appointmentsByDay.get(key) ?? [];
                    const isOutsideMonth = day.getMonth() !== anchor.getMonth() && mode === "month";
                    const isToday = key === dayKey(new Date());
                    return (
                      <div
                        key={key}
                        className={`min-h-[132px] border-b border-r border-white/[0.06] p-2 sm:p-3 ${
                          isOutsideMonth ? "bg-black/10 text-white/25" : "text-white/70"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openCreate(day)}
                            className={`ds-focus-ring rounded px-1.5 py-0.5 text-xs font-semibold transition hover:bg-white/[0.06] ${
                              isToday ? "bg-[#C9A24D] text-black" : "text-inherit"
                            }`}
                          >
                            {day.getDate()}
                          </button>
                          {dayAppointments.length > 0 && (
                            <span className="text-[10px] text-white/25">{dayAppointments.length}</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {dayAppointments.slice(0, mode === "week" ? 6 : 3).map((appointment) => (
                            <button
                              key={appointment.id}
                              type="button"
                              onClick={() => openEdit(appointment)}
                              className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight transition hover:border-white/25 ${CATEGORY_STYLE[appointment.category]} ${appointment.status === "cancelled" ? "opacity-55" : ""}`}
                            >
                              <span className="block truncate font-semibold">{appointmentLabel(appointment)}</span>
                              <span className="mt-0.5 block truncate opacity-70">{formatTimeRange(appointment)}</span>
                            </button>
                          ))}
                          {dayAppointments.length > (mode === "week" ? 6 : 3) && (
                            <p className="text-[10px] text-white/30">+{dayAppointments.length - (mode === "week" ? 6 : 3)} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card tone="dark" padding="md" className="border-white/[0.08]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/30">
                  Upcoming
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">Next appointments</h3>
              </div>
              <Clock3 className="size-4 text-[#C9A24D]/70" />
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                tone="dark"
                icon={<CalendarDays className="size-5" />}
                title="No upcoming appointments"
                description="Scheduled appointments will appear here once created."
                className="py-8"
              />
            ) : (
              <div className="space-y-3">
                {upcoming.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => openEdit(appointment)}
                    className="ds-focus-ring w-full rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-left transition hover:border-white/[0.16] hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white/85">
                          {appointmentLabel(appointment)}
                        </p>
                        <p className="mt-1 text-xs text-white/40">
                          {formatShortDate(new Date(appointment.startsAt))} · {formatTimeRange(appointment)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_STYLE[appointment.category]}`}>
                        {CATEGORY_LABEL[appointment.category]}
                      </span>
                    </div>
                    {appointment.clientName && (
                      <p className="mt-2 truncate text-xs text-white/35">{appointment.clientName}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card tone="dark" padding="md" className="border-white/[0.08]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/30">
              Categories
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABEL) as AppointmentCategory[]).map((category) => (
                <span key={category} className={`rounded-full border px-2.5 py-1 text-[11px] ${CATEGORY_STYLE[category]}`}>
                  {CATEGORY_LABEL[category]}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(form)}
        onClose={() => !saving && setForm(null)}
        title={form?.id ? "Edit Appointment" : "Create Appointment"}
        description="Private coach schedule item. External calendar sync is not connected."
        tone="dark"
        size="lg"
        footer={
          <>
            {form?.id && (
              <Button
                type="button"
                tone="dark"
                variant="destructive"
                size="sm"
                leftIcon={<Trash2 />}
                loading={saving}
                onClick={deleteAppointment}
                className="mr-auto"
              >
                Delete
              </Button>
            )}
            {form?.id && form.status !== "cancelled" && (
              <Button
                type="button"
                tone="dark"
                variant="outline"
                size="sm"
                leftIcon={<XCircle />}
                loading={saving}
                onClick={cancelAppointment}
              >
                Cancel Appointment
              </Button>
            )}
            <Button type="button" tone="dark" variant="secondary" size="sm" onClick={() => setForm(null)} disabled={saving}>
              Close
            </Button>
            <Button type="button" tone="dark" size="sm" leftIcon={<Edit3 />} loading={saving} onClick={saveAppointment}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label tone="dark" htmlFor="appointment-client">Client</Label>
              <Select
                id="appointment-client"
                tone="dark"
                value={form.clientId}
                onChange={(event) => setForm({ ...form, clientId: event.target.value })}
              >
                <option value="">No client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} · {client.email}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label tone="dark" htmlFor="appointment-title">Title</Label>
              <Input
                id="appointment-title"
                tone="dark"
                value={form.title}
                placeholder="Optional"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div>
              <Label tone="dark" htmlFor="appointment-category" required>Category</Label>
              <Select
                id="appointment-category"
                tone="dark"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value as AppointmentCategory })}
              >
                {(Object.keys(CATEGORY_LABEL) as AppointmentCategory[]).map((category) => (
                  <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label tone="dark" htmlFor="appointment-status" required>Status</Label>
              <Select
                id="appointment-status"
                tone="dark"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as AppointmentStatus })}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
            <div>
              <Label tone="dark" htmlFor="appointment-start" required>Start</Label>
              <Input
                id="appointment-start"
                tone="dark"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              />
            </div>
            <div>
              <Label tone="dark" htmlFor="appointment-end" required>End</Label>
              <Input
                id="appointment-end"
                tone="dark"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label tone="dark" htmlFor="appointment-notes">Private Coach Notes</Label>
              <Textarea
                id="appointment-notes"
                tone="dark"
                value={form.privateNotes}
                placeholder="Notes are private to the coach."
                onChange={(event) => setForm({ ...form, privateNotes: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${CATEGORY_STYLE[form.category]}`}>
                {CATEGORY_LABEL[form.category]}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${STATUS_STYLE[form.status]}`}>
                {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
              </span>
            </div>
            <FieldError className="sm:col-span-2">{formError}</FieldError>
          </div>
        )}
      </Modal>
    </div>
  );
}
