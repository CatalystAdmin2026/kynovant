"use client";

// Temporary dev preview — kitchen-sink visual QA for the Kynovant
// Design System (components/ui/*). Not linked from product nav.
// Delete after visual QA, or keep as a living reference — either
// way it renders no business logic, only the primitives themselves.

import { useState } from "react";
import { Plus, Settings, Trash2, ChevronDown, Users } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  StatusChip,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  Dropdown,
  Tabs,
  Input,
  Textarea,
  Select,
  Label,
  HelperText,
  FieldError,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTableRow,
  EmptyState,
} from "@/components/ui";

function Section({ title, children, dark = false }: { title: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <section className={dark ? "bg-[#080909] p-8 rounded-2xl" : ""}>
      <h2
        className={
          dark
            ? "text-label font-semibold uppercase tracking-widest text-gold mb-5"
            : "text-label font-semibold uppercase tracking-widest text-gray-400 mb-5"
        }
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemPreview() {
  const [modalOpen, setModalOpen] = useState(false);
  const [darkModalOpen, setDarkModalOpen] = useState(false);
  const [tab, setTab] = useState("training");

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="mx-auto max-w-5xl px-6 flex flex-col gap-16">
        <header>
          <p className="text-label font-semibold uppercase tracking-widest text-gold mb-2">
            Kynovant Design System
          </p>
          <h1 className="text-display font-headline font-bold text-gray-900">Primitives</h1>
          <p className="text-body-lg text-gray-500 mt-2 max-w-xl">
            Reusable building blocks — spacing, type, color, elevation, and motion in one place.
            Nothing on this page is wired into product logic.
          </p>
        </header>

        {/* ── Typography ─────────────────────────────────────── */}
        <Section title="Typography Scale">
          <div className="flex flex-col gap-3">
            <p className="text-display font-headline font-bold text-gray-900">Display — Aa</p>
            <p className="text-h1 font-headline font-bold text-gray-900">Heading 1 — Aa</p>
            <p className="text-h2 font-semibold text-gray-900">Heading 2 — Aa</p>
            <p className="text-h3 font-semibold text-gray-900">Heading 3 — Aa</p>
            <p className="text-h4 font-semibold text-gray-900">Heading 4 — Aa</p>
            <p className="text-body-lg text-gray-700">Body Large — coaches read this comfortably at distance.</p>
            <p className="text-body text-gray-700">Body — the default reading size across data panels.</p>
            <p className="text-body-sm text-gray-500">Body Small — secondary supporting copy.</p>
            <p className="text-caption text-gray-500">Caption — evidence, metadata, timestamps.</p>
            <p className="text-label font-semibold uppercase tracking-wider text-gray-400">Label — section markers</p>
          </div>
        </Section>

        {/* ── Buttons ────────────────────────────────────────── */}
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link button</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button leftIcon={<Plus />}>New Blueprint</Button>
            <Button variant="outline" rightIcon={<ChevronDown />}>
              Filter
            </Button>
            <Button loading>Saving…</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        {/* ── Badges & Status Chips ──────────────────────────── */}
        <Section title="Badges &amp; Status Chips">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="gold">Flagship</Badge>
            <Badge variant="success">Active</Badge>
            <Badge variant="warning">Elevated</Badge>
            <Badge variant="danger">Overdue</Badge>
            <Badge variant="info">Beta</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status="ok" />
            <StatusChip status="caution" />
            <StatusChip status="high" />
            <StatusChip status="critical" />
            <StatusChip status="unknown" />
          </div>
        </Section>

        {/* ── Cards ──────────────────────────────────────────── */}
        <Section title="Cards">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Blueprint Intelligence</CardTitle>
                  <CardDescription>Volume, fatigue, and movement analysis.</CardDescription>
                </div>
                <StatusChip status="ok" size="sm" />
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-gray-600">
                  No findings above caution. All dimensions within expected range.
                </p>
              </CardContent>
              <CardFooter>
                <span className="text-caption text-gray-400">Updated 2m ago</span>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </CardFooter>
            </Card>

            <Card interactive>
              <CardHeader>
                <div>
                  <CardTitle>Interactive Card</CardTitle>
                  <CardDescription>Hover to see elevation change.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-gray-600">
                  Use `interactive` for clickable cards (blueprint tiles, client rows).
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-5">
            <Card tone="dark">
              <CardHeader>
                <div>
                  <CardTitle tone="dark">Dark Surface Card</CardTitle>
                  <CardDescription tone="dark">Matches the portal / HQ shell chrome.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-white/60">Same primitive, `tone=&quot;dark&quot;`.</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── Table ──────────────────────────────────────────── */}
        <Section title="Table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Check-In</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow interactive>
                <TableCell className="font-medium text-gray-900">Emma Carter</TableCell>
                <TableCell>Kynovant Elite — Week 6</TableCell>
                <TableCell>
                  <StatusChip status="ok" size="sm" />
                </TableCell>
                <TableCell className="text-gray-500">2 days ago</TableCell>
              </TableRow>
              <TableRow interactive>
                <TableCell className="font-medium text-gray-900">Marcus Webb</TableCell>
                <TableCell>Executive Performance — Week 2</TableCell>
                <TableCell>
                  <StatusChip status="caution" size="sm" />
                </TableCell>
                <TableCell className="text-gray-500">5 days ago</TableCell>
              </TableRow>
              <SkeletonTableRow columns={4} />
            </TableBody>
          </Table>
        </Section>

        {/* ── Inputs ─────────────────────────────────────────── */}
        <Section title="Inputs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
            <div>
              <Label htmlFor="ds-name">Full Name</Label>
              <Input id="ds-name" placeholder="Jane Cooper" />
              <HelperText>As it appears on the client agreement.</HelperText>
            </div>
            <div>
              <Label htmlFor="ds-email" required>
                Email
              </Label>
              <Input id="ds-email" type="email" placeholder="jane@example.com" error />
              <FieldError>Enter a valid email address.</FieldError>
            </div>
            <div>
              <Label htmlFor="ds-category">Category</Label>
              <Select id="ds-category" defaultValue="">
                <option value="" disabled>
                  Select a category
                </option>
                <option value="fat_loss">Fat Loss</option>
                <option value="muscle_growth">Muscle Growth</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ds-notes">Coaching Notes</Label>
              <Textarea id="ds-notes" placeholder="Private notes visible only to coaches…" />
            </div>
          </div>
        </Section>

        {/* ── Dropdown & Tabs ────────────────────────────────── */}
        <Section title="Dropdown &amp; Tabs">
          <div className="flex items-center gap-4 mb-8">
            <Dropdown>
              <Dropdown.Trigger className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Settings className="size-3.5" /> Actions <ChevronDown className="size-3.5" />
              </Dropdown.Trigger>
              <Dropdown.Content>
                <Dropdown.Item onSelect={() => {}}>
                  <Users className="size-3.5" /> Reassign coach
                </Dropdown.Item>
                <Dropdown.Item onSelect={() => {}}>Export data</Dropdown.Item>
                <Dropdown.Separator />
                <Dropdown.Item destructive onSelect={() => {}}>
                  <Trash2 className="size-3.5" /> Archive client
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <Tabs.List aria-label="Insights dimensions">
              <Tabs.Tab value="training">Training</Tabs.Tab>
              <Tabs.Tab value="nutrition">Nutrition</Tabs.Tab>
              <Tabs.Tab value="recovery">Recovery</Tabs.Tab>
            </Tabs.List>
            <div className="pt-4">
              <Tabs.Panel value="training">
                <p className="text-body-sm text-gray-600">Volume, fatigue, and movement pattern analysis.</p>
              </Tabs.Panel>
              <Tabs.Panel value="nutrition">
                <p className="text-body-sm text-gray-600">Macro targets and adherence trends.</p>
              </Tabs.Panel>
              <Tabs.Panel value="recovery">
                <p className="text-body-sm text-gray-600">Sleep, stress, and recovery spacing.</p>
              </Tabs.Panel>
            </div>
          </Tabs>
        </Section>

        {/* ── Modal ──────────────────────────────────────────── */}
        <Section title="Modal">
          <div className="flex gap-3">
            <Button onClick={() => setModalOpen(true)}>Open Light Modal</Button>
            <Button variant="secondary" onClick={() => setDarkModalOpen(true)}>
              Open Dark Modal
            </Button>
          </div>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            tone="light"
            title="Archive this client?"
            description="This can be undone from the archived clients view."
            footer={
              <>
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => setModalOpen(false)}>
                  Archive
                </Button>
              </>
            }
          >
            <p className="text-body-sm text-gray-600">
              The client will stop appearing in your active roster. Their program history is preserved.
            </p>
          </Modal>

          <Modal
            open={darkModalOpen}
            onClose={() => setDarkModalOpen(false)}
            tone="dark"
            title="Assign Program"
            description="Choose a blueprint to assign"
            footer={
              <Button tone="dark" onClick={() => setDarkModalOpen(false)}>
                Continue
              </Button>
            }
          >
            <p className="text-body-sm text-white/60">Dark-tone modal matches the existing HQ shell aesthetic.</p>
          </Modal>
        </Section>

        {/* ── Skeletons ──────────────────────────────────────── */}
        <Section title="Loading Skeletons">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <SkeletonCard />
            <div className="rounded-xl border border-gray-100 shadow-card p-6 bg-white">
              <SkeletonText lines={4} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton width="w-24" height="h-8" rounded="lg" />
            <Skeleton width="w-32" height="h-8" rounded="lg" />
            <Skeleton width="size-8" height="size-8" rounded="full" />
          </div>
        </Section>

        {/* ── Empty States ───────────────────────────────────── */}
        <Section title="Empty States">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="rounded-xl border border-gray-100 bg-white">
              <EmptyState
                title="No check-ins yet"
                description="Check-ins will appear here once your client submits their first week."
                action={<Button size="sm">Send reminder</Button>}
              />
            </div>
            <div className="rounded-xl bg-[#080909]">
              <EmptyState
                tone="dark"
                title="No findings"
                description="Nothing needs your attention on this dimension right now."
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
