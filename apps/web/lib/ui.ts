// Shared Tailwind class strings for repeated UI patterns.
// Still 100% utility-first — just avoids re-typing long class lists.

export const cx = (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(" ");

/* ---------- Panels ---------- */

export const panel =
    "overflow-hidden rounded-xl border border-border bg-panel";

export const panelHeader =
    "flex min-h-[54px] items-center justify-between border-b border-border px-3.5 py-3 max-md:min-h-[50px] max-md:px-3 max-md:py-2.5";

export const panelTitle =
    "text-[13px] font-bold uppercase tracking-[0.06em] text-text-dim";

export const tradePanelHeight = "h-[418px] md:h-[698px]";

/* ---------- Tabs ---------- */

export const tabs = "flex gap-[3px]";

export const tab =
    "cursor-pointer rounded-lg border-none bg-none px-3.5 py-2 text-[14.5px] font-semibold text-text-dim transition-colors hover:text-text max-md:px-3 max-md:py-[7px] max-md:text-[14px]";

export const tabActive = "bg-panel-hover !text-text";

/* ---------- Tables ---------- */

export const tableWrap = "overflow-x-auto";

export const table =
    "w-full border-collapse text-[14.5px] [&_tbody_tr:hover]:bg-panel-hover";

export const th =
    "whitespace-nowrap border-b border-border px-3.5 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-text-faint first:pl-[18px] last:pr-[18px] max-md:px-3 max-md:py-[9px] max-md:first:pl-3.5 max-md:last:pr-3.5";

export const td =
    "whitespace-nowrap border-b border-border px-3.5 py-[11px] font-mono first:pl-[18px] last:pr-[18px] max-md:px-3 max-md:py-[9px] max-md:first:pl-3.5 max-md:last:pr-3.5";

export const emptyState = "px-4 py-8 text-center text-[14.5px] text-text-faint";

/* ---------- Badges ---------- */

export const badge =
    "inline-flex items-center rounded-[5px] px-[9px] py-[3px] text-[12.5px] font-semibold capitalize";

export const badgeVariants: Record<string, string> = {
    long: "bg-up-bg text-up",
    short: "bg-down-bg text-down",
    buy: "bg-up-bg text-up",
    sell: "bg-down-bg text-down",
    open: "bg-accent-bg text-accent",
    filled: "bg-up-bg text-up",
    cancelled: "bg-panel-hover text-text-dim",
    partially: "bg-warning text-[#1a1500]",
};

/* ---------- Buttons ---------- */

export const btn =
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-panel px-[18px] py-[11px] text-[15px] font-semibold text-text transition-colors hover:border-border-strong hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary =
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-[18px] py-[11px] text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(227,62,63,0.25)] transition-colors hover:border-accent-hover hover:bg-accent-hover active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export const btnBlock = "w-full";

export const actionBtn =
    "cursor-pointer rounded-lg border border-border bg-none px-[13px] py-[7px] text-[13px] font-semibold text-text-dim transition-colors hover:border-down hover:text-down";

export const btnBuy =
    "min-h-[50px] cursor-pointer rounded-[10px] border-none bg-up p-3.5 text-[15.5px] font-bold text-[#04120c] transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

export const btnSell =
    "min-h-[50px] cursor-pointer rounded-[10px] border-none bg-down p-3.5 text-[15.5px] font-bold text-white transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

/* ---------- Forms ---------- */

export const formField = "flex flex-col gap-1.5";

export const formLabel =
    "flex items-center justify-between text-[13.5px] font-medium text-text-dim";

export const formHint = "font-mono text-[12px] text-text-faint";

export const formInput =
    "w-full rounded-[9px] border border-border bg-bg-sunken px-[13px] py-3 font-mono text-[15px] text-text outline-none transition-shadow focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]";

/* ---------- Feedback ---------- */

export const spinner =
    "inline-block size-[17px] animate-spin rounded-full border-2 border-border-strong border-t-accent";

export const centerLoader =
    "flex items-center justify-center gap-2.5 p-14 text-[14px] text-text-faint";

/* ---------- Text helpers ---------- */

export const upText = "text-up";
export const downText = "text-down";

/* ---------- Page headers ---------- */

export const pageHeader = "mb-[18px] flex items-center justify-between";

export const pageTitle =
    "text-2xl font-bold tracking-tight max-[520px]:text-xl";

export const pageSubtitle = "mt-0.5 text-[14.5px] text-text-dim";
