"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CURRENT_CHANGELOG } from "@/config/changelog";
import { Sparkles, Check } from "lucide-react";

export function ReleaseNotesModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    const storageKey = `wacrm_last_seen_version`;
    const lastSeenVersion = localStorage.getItem(storageKey);

    if (lastSeenVersion !== CURRENT_CHANGELOG.version) {
      // Small timeout to prevent layout flashes on initial render
      const timer = setTimeout(() => {
        setOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(`wacrm_last_seen_version`, CURRENT_CHANGELOG.version);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px] border-border bg-card p-6 gap-6 rounded-2xl animate-in fade-in-50 zoom-in-95 duration-200">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5 text-primary" style={{ color: "#FF5706" }} />
            </span>
            <div>
              <div className="text-xs font-semibold text-primary uppercase tracking-wider" style={{ color: "#FF5706" }}>
                Novidades da Versão {CURRENT_CHANGELOG.version}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Publicado em {CURRENT_CHANGELOG.date}
              </div>
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {CURRENT_CHANGELOG.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {CURRENT_CHANGELOG.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            O que mudou:
          </h4>
          <ul className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {CURRENT_CHANGELOG.items.map((item, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-snug">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mt-0.5">
                  <Check className="h-3 w-3" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="pt-2">
          <Button
            onClick={handleDismiss}
            className="w-full font-medium transition-all hover:scale-[1.01] active:scale-[0.99] text-white"
            style={{ backgroundColor: "#FF5706" }}
          >
            Entendi, ir para o CRM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
