"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, Terminal, FileText, Brain, AlertCircle, MessageSquare, Wrench } from "lucide-react";
import type { TranscriptEvent, Transcript } from "@/lib/types";
import { O11ySummary } from "./O11ySummary";

interface TranscriptViewerProps {
  transcript: Transcript;
}

const EVENT_CONFIG: Record<
  TranscriptEvent["type"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
> = {
  message: { label: "Message", variant: "default", icon: MessageSquare },
  tool_call: { label: "Tool Call", variant: "secondary", icon: Wrench },
  tool_result: { label: "Tool Result", variant: "outline", icon: Terminal },
  thinking: { label: "Thinking", variant: "outline", icon: Brain },
  error: { label: "Error", variant: "destructive", icon: AlertCircle },
};

function TranscriptEventCard({ event, index }: { event: TranscriptEvent; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = EVENT_CONFIG[event.type];
  const Icon = config.icon;

  const hasExpandableContent =
    event.tool?.args ||
    event.tool?.result ||
    (event.content && event.content.length > 200);

  const preview = event.content
    ? event.content.slice(0, 200) + (event.content.length > 200 ? "..." : "")
    : event.tool
      ? `${event.tool.originalName}${event.tool.success === false ? " (failed)" : ""}`
      : null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card size="sm" className="border-l-4 overflow-hidden" style={{ borderLeftColor: getEventColor(event.type) }}>
        <CollapsibleTrigger className="w-full text-left cursor-pointer transition-colors hover:bg-muted rounded-t-lg" disabled={!hasExpandableContent}>
          <CardContent className="py-0 px-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground w-5 text-right font-mono shrink-0">
                {index + 1}
              </span>
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Badge variant={config.variant} className="text-xs shrink-0 max-w-32 truncate">
                {event.type === "tool_call" && event.tool
                  ? event.tool.originalName
                  : config.label}
              </Badge>
              {event.role && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {event.role}
                </Badge>
              )}
              <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                {preview}
              </p>
              {event.tool?.durationMs !== undefined && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {event.tool.durationMs}ms
                </span>
              )}
              {hasExpandableContent && (
                <ChevronRight
                  className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
              )}
            </div>
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-0 space-y-2">
            <Separator />
            {event.content && (
              <pre className="text-xs font-mono bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                {event.content}
              </pre>
            )}
            {event.tool?.args && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Arguments:</div>
                <pre className="text-xs font-mono bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {JSON.stringify(event.tool.args, null, 2)}
                </pre>
              </div>
            )}
            {event.tool?.result !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Result:</div>
                <pre className="text-xs font-mono bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {typeof event.tool.result === "string"
                    ? event.tool.result
                    : JSON.stringify(event.tool.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function getEventColor(type: TranscriptEvent["type"]): string {
  switch (type) {
    case "message":
      return "hsl(217, 91%, 60%)"; // blue
    case "tool_call":
      return "hsl(271, 91%, 65%)"; // purple
    case "tool_result":
      return "hsl(215, 14%, 50%)"; // gray
    case "thinking":
      return "hsl(48, 96%, 53%)"; // yellow
    case "error":
      return "hsl(0, 84%, 60%)"; // red
    default:
      return "hsl(215, 14%, 50%)";
  }
}

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  return (
    <Tabs defaultValue="timeline" className="w-full">
      <TabsList>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" className="mt-4">
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Agent </span>
              <span className="font-medium">{transcript.agent}</span>
            </div>
            {transcript.model && (
              <div>
                <span className="text-muted-foreground">Model </span>
                <span className="font-medium">{transcript.model}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Events </span>
              <span className="font-medium">{transcript.events.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status </span>
              <Badge
                variant={transcript.parseSuccess ? "default" : "destructive"}
                className="text-xs"
              >
                {transcript.parseSuccess ? "Success" : "Partial"}
              </Badge>
            </div>
          </div>

          <O11ySummary summary={transcript.summary} />

          {/* Timeline */}
          <div className="space-y-2">
            {transcript.events.map((event, i) => (
              <TranscriptEventCard key={i} event={event} index={i} />
            ))}
            {transcript.events.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No transcript events found.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="summary" className="mt-4">
        <O11ySummary summary={transcript.summary} />
      </TabsContent>

      <TabsContent value="raw" className="mt-4">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <pre className="text-xs font-mono bg-muted rounded p-4 whitespace-pre-wrap break-all">
            {JSON.stringify(transcript, null, 2)}
          </pre>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
