import { cn } from "@/lib/design-system/cn";

type IconProps = {
  className?: string;
  title?: string;
};

/** Unified stroke icons — 1.75 stroke, round caps. No filled variants. */
function IconBase({
  className,
  title,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-[1.1em] w-[1.1em] shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </IconBase>
  );
}

export function IconToday(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" />
    </IconBase>
  );
}

export function IconAutomation(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <path d="M18 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8" />
      <path d="M6 20v-4h4" />
    </IconBase>
  );
}

export function IconList(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 7h12M8 12h12M8 17h12" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </IconBase>
  );
}

export function IconArtifact(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 3.5h7l4 4V20.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 13h6M9 17h4" />
    </IconBase>
  );
}

export function IconBell(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6.5 16.5h11l-1.2-1.5V11a4.3 4.3 0 1 0-8.6 0v4l-1.2 1.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function IconLink(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.6l-1.1 1.1" />
      <path d="M14 11a4 4 0 0 0-5.7-.3l-2 2a4 4 0 0 0 5.7 5.6l1.1-1.1" />
    </IconBase>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M5.8 18.2l1.6-1.6M16.6 7.4l1.6-1.6" />
    </IconBase>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 13.8 9l5.7 1.2-4.3 3.8 1.3 5.7L12 16.7 7.5 19.7l1.3-5.7-4.3-3.8L10.2 9 12 3.5Z" />
    </IconBase>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12.5 10 17.5 19 7.5" />
    </IconBase>
  );
}

export function IconClock(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.5" />
    </IconBase>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4.5 20.5 19H3.5L12 4.5Z" />
      <path d="M12 10v4M12 16.5h.01" />
    </IconBase>
  );
}

export function IconPause(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 6v12M16 6v12" />
    </IconBase>
  );
}

export function IconShare(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8 12.8 16 17.2M16 6.8 8 11.2" />
    </IconBase>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </IconBase>
  );
}

export function IconReuse(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 12a7 7 0 0 1 12-4.5" />
      <path d="M16 4v4h-4" />
      <path d="M20 12a7 7 0 0 1-12 4.5" />
      <path d="M8 20v-4h4" />
    </IconBase>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 20 20" />
    </IconBase>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 10l4 4 4-4" />
    </IconBase>
  );
}

export function IconUser(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </IconBase>
  );
}

export function IconEmptyWork(props: IconProps) {
  return (
    <IconBase {...props} className={cn("h-10 w-10", props.className)}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </IconBase>
  );
}

const NAV_ICON_MAP = {
  home: IconHome,
  today: IconToday,
  automation: IconAutomation,
  list: IconList,
  artifact: IconArtifact,
  bell: IconBell,
  link: IconLink,
  settings: IconSettings,
  plus: IconPlus,
} as const;

export type NavIconId = keyof typeof NAV_ICON_MAP;

export function NavIcon({
  id,
  className,
}: {
  id: NavIconId;
  className?: string;
}) {
  const Cmp = NAV_ICON_MAP[id];
  return <Cmp className={className} />;
}
