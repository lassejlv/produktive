import {
  Add01Icon,
  ArrowExpandIcon,
  AtIcon as HugeAtIcon,
  AttachmentIcon,
  CheckmarkCircle01Icon,
  CircleSlashTwoIcon,
  Copy01Icon,
  Folder01Icon,
  FolderKanbanIcon,
  GitCompareIcon,
  Github01Icon,
  HashtagIcon,
  InboxUnreadIcon,
  MoreHorizontalIcon,
  PlayIcon as HugePlayIcon,
  RefreshIcon as HugeRefreshIcon,
  Search01Icon,
  SentIcon,
  Settings01Icon,
  SidebarLeftIcon,
  SparklesIcon,
  StarIcon as HugeStarIcon,
  StopIcon as HugeStopIcon,
  Task01Icon,
  ThumbsUpIcon as HugeThumbsUpIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";

type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon"> & {
  size?: number | string;
};

function Icon({ strokeWidth = 1.8, ...props }: HugeiconsIconProps) {
  return <HugeiconsIcon aria-hidden="true" strokeWidth={strokeWidth} {...props} />;
}

export function PlusIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={Add01Icon} size={size} {...rest} />;
}

export function SearchIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={Search01Icon} size={size} {...rest} />;
}

export function InboxIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={InboxUnreadIcon} size={size} {...rest} />;
}

export function IssuesIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={Task01Icon} size={size} {...rest} />;
}

export function SparkleIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={SparklesIcon} size={size} {...rest} />;
}

export function FolderIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={Folder01Icon} size={size} {...rest} />;
}

export function ProjectsIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={FolderKanbanIcon} size={size} {...rest} />;
}

export function SendIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={SentIcon} size={size} {...rest} />;
}

export function StarIcon({
  size = 13,
  filled = false,
  strokeWidth,
  ...rest
}: IconProps & { filled?: boolean }) {
  return (
    <Icon
      icon={HugeStarIcon}
      size={size}
      strokeWidth={strokeWidth ?? (filled ? 2.25 : 1.8)}
      {...rest}
    />
  );
}

export function PlayIcon({ size = 9, ...rest }: IconProps) {
  return <Icon icon={HugePlayIcon} size={size} {...rest} />;
}

export function StopIcon({ size = 11, ...rest }: IconProps) {
  return <Icon icon={HugeStopIcon} size={size} {...rest} />;
}

export function AttachIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={AttachmentIcon} size={size} {...rest} />;
}

export function SlashIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={CircleSlashTwoIcon} size={size} {...rest} />;
}

export function HashIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={HashtagIcon} size={size} {...rest} />;
}

export function AtIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={HugeAtIcon} size={size} {...rest} />;
}

export function ChangesIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={GitCompareIcon} size={size} {...rest} />;
}

export function GithubIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={Github01Icon} size={size} {...rest} />;
}

export function ExpandIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={ArrowExpandIcon} size={size} {...rest} />;
}

export function CheckIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={CheckmarkCircle01Icon} size={size} {...rest} />;
}

export function CaretIcon({ size = 11, ...rest }: IconProps) {
  return <Icon icon={HugeiconsCaretDownIcon} size={size} {...rest} />;
}

export function CopyIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={Copy01Icon} size={size} {...rest} />;
}

export function RefreshIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={HugeRefreshIcon} size={size} {...rest} />;
}

export function ThumbsUpIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={HugeThumbsUpIcon} size={size} {...rest} />;
}

export function DotsIcon({ size = 13, ...rest }: IconProps) {
  return <Icon icon={MoreHorizontalIcon} size={size} {...rest} />;
}

export function SettingsIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={Settings01Icon} size={size} {...rest} />;
}

export function SidebarIcon({ size = 14, ...rest }: IconProps) {
  return <Icon icon={SidebarLeftIcon} size={size} {...rest} />;
}

const HugeiconsCaretDownIcon = [
  ["path", { d: "M6 9L12 15L18 9", key: "0" }],
] as const;
