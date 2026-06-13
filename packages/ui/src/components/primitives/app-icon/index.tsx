import { InspectIcon } from "../icons";

interface AppIconProps {
  className?: string;
  iconUrl?: string;
  alt?: string;
}

export function AppIcon({ className, iconUrl, alt }: AppIconProps) {
  if (iconUrl) {
    return <img src={iconUrl} alt={alt} className={className} />;
  }
  return <InspectIcon className={className} />;
}

export { AppIcon as default };
