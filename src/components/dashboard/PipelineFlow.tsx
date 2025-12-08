import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, Loader2, Circle } from "lucide-react";

interface PipelineStep {
  id: string;
  name: string;
  status: "complete" | "processing" | "pending";
  count?: number;
}

const pipelineSteps: PipelineStep[] = [
  { id: "ingest", name: "Ingestion", status: "complete", count: 4521 },
  { id: "normalize", name: "Normalization", status: "complete", count: 4498 },
  { id: "nlp", name: "NLP Processing", status: "processing", count: 3241 },
  { id: "ocr", name: "OCR Extract", status: "processing", count: 892 },
  { id: "index", name: "Indexing", status: "pending" },
  { id: "store", name: "Storage", status: "pending" },
];

const statusIcon = {
  complete: <CheckCircle2 className="w-5 h-5 text-success" />,
  processing: <Loader2 className="w-5 h-5 text-primary animate-spin" />,
  pending: <Circle className="w-5 h-5 text-muted-foreground" />,
};

export const PipelineFlow = () => {
  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="font-semibold text-foreground">Processing Pipeline</h3>
        <p className="text-xs text-muted-foreground mt-1">Real-time data flow through SIE stages</p>
      </div>

      <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-thin">
        {pipelineSteps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div 
              className={cn(
                "flex flex-col items-center min-w-[100px] transition-all duration-300",
                step.status === "processing" && "scale-105"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center mb-2 transition-all",
                step.status === "complete" && "bg-success/10 border border-success/30",
                step.status === "processing" && "bg-primary/10 border border-primary/30 shadow-lg shadow-primary/20",
                step.status === "pending" && "bg-muted border border-border"
              )}>
                {statusIcon[step.status]}
              </div>
              
              <span className={cn(
                "text-xs font-medium text-center",
                step.status === "complete" && "text-success",
                step.status === "processing" && "text-primary",
                step.status === "pending" && "text-muted-foreground"
              )}>
                {step.name}
              </span>
              
              {step.count !== undefined && (
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {step.count.toLocaleString()} items
                </span>
              )}
            </div>

            {index < pipelineSteps.length - 1 && (
              <ArrowRight className={cn(
                "w-4 h-4 mx-2 flex-shrink-0 transition-colors",
                pipelineSteps[index + 1].status !== "pending" ? "text-primary" : "text-muted-foreground/50"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="text-primary font-medium">67%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full transition-all duration-1000"
            style={{ width: "67%" }}
          />
        </div>
      </div>
    </div>
  );
};
