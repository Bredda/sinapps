import { cn } from "@sinapps/ui/lib/utils";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { Streamdown, type StreamdownTranslations } from "streamdown";
import "katex/dist/katex.min.css";
import { m } from "@/paraglide/messages.js";

const plugins = { code, math };

const translations = (): Partial<StreamdownTranslations> => ({
  close: m.action_close(),
  copied: m.action_copied(),
  copyCode: m.markdown_copy_code(),
  copyLink: m.markdown_copy_link(),
  copyTable: m.markdown_copy_table(),
  downloadFile: m.markdown_download_file(),
  downloadTable: m.markdown_download_table(),
  externalLinkWarning: m.markdown_external_link_warning(),
  openExternalLink: m.markdown_open_external_link(),
  openLink: m.markdown_open_link(),
  viewFullscreen: m.markdown_view_fullscreen(),
  exitFullscreen: m.markdown_exit_fullscreen(),
});

/** Model output: GFM, code highlighting and math, tolerant of half-streamed syntax. */
export function Markdown({
  children,
  streaming = false,
  className,
}: {
  children: string;
  streaming?: boolean;
  className?: string;
}) {
  return (
    <Streamdown
      className={cn("min-w-0 text-sm leading-relaxed", className)}
      plugins={plugins}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      translations={translations()}
    >
      {children}
    </Streamdown>
  );
}
